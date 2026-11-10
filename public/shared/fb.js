// Conexión con Firebase para las dos apps. Expone window.FBready (una promesa) con:
//   configured, auth (user, onUser, google, anon, out), db (collection, query, doc, batch), assets (o null)
import * as CFG from "./firebase-config.js";
const { firebaseConfig, storageEnabled } = CFG;

const V = "10.12.2";
const base = `https://www.gstatic.com/firebasejs/${V}/`;

// La app puede pedir la conexión antes o después de que cargue este archivo:
// avisamos por las dos vías (window.FBready y window.__fbResolve) para que nunca se quede esperando.
let resolveFB, api_;
if (!window.FBready) window.FBready = new Promise(r => (resolveFB = r));
const done = api => {
  api_ = api;
  if (resolveFB) resolveFB(api);
  if (window.__fbResolve) window.__fbResolve(api);
  window.__fbApi = api;
};

async function start() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "PEGA_AQUI") {
    done({ configured: false });
    return;
  }
  const [{ initializeApp }, A, F, St] = await Promise.all([
    import(base + "firebase-app.js"),
    import(base + "firebase-auth.js"),
    import(base + "firebase-firestore.js"),
    storageEnabled ? import(base + "firebase-storage.js") : Promise.resolve(null)
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let fs;
  // Conexión en tiempo real (streaming); si la red la bloquea, Firestore cambia solo a long polling
  try { fs = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true, localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { try { fs = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); } catch (e2) { fs = F.getFirestore(app); } }

  // Nunca dejar la app colgada esperando al servidor
  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: "timeout", message: "El servidor no respondió en " + Math.round(ms / 1000) + " s" }), ms))]);
  const writeErr = e => window.dispatchEvent(new CustomEvent("fb-write-error", { detail: errCode(e) }));
  // Escrituras: si el servidor tarda, seguimos (quedan en cola y se envían al reconectar); un rechazo posterior se avisa con fb-write-error
  const write = async (p, confirm) => {
    if (confirm) { try { return await timeout(p, 15000); } catch (e) { throw e.code === "timeout" ? e : errCode(e); } }
    p.catch(writeErr);
    try { await timeout(p, 4000); } catch (e) { if (e.code !== "timeout") throw errCode(e); }
  };

  const clean = d => JSON.parse(JSON.stringify(d, (k, v) => v === undefined ? null : v));
  const wrapSnap = snap => ({ docs: snap.docs.map(d => ({ id: d.id, data: () => d.data() })) });
  const errCode = e => ({ code: e?.code === "permission-denied" ? "permission_denied" : (e?.code || "unavailable"), message: e?.message || "" });
  const wrapRef = r => ({
    get: async () => { try { const s = await timeout(F.getDoc(r), 12000); return s.exists() ? { id: s.id, ...s.data() } : null; } catch (e) { throw e?.code === "timeout" ? e : errCode(e); } },
    // v58: limpia valores "undefined" (Firestore rechaza todo el guardado si hay uno, p. ej. al asignar una rutina base)
    set: (d, opt) => { try { return write(F.setDoc(r, clean(d)), opt?.confirm); } catch (e) { return Promise.reject(errCode(e)); } },
    update: (d, opt) => { try { return write(F.setDoc(r, clean(d), { mergeFields: Object.keys(d) }), opt?.confirm); } catch (e) { return Promise.reject(errCode(e)); } }, // reemplaza solo esos campos
    delete: () => write(F.deleteDoc(r)),
    onSnapshot: (cb, err) => F.onSnapshot(r, s => cb(s.exists() ? { id: s.id, ...s.data() } : null), e => err && err(errCode(e)))
  });
  const listen = (q, cb, err) => F.onSnapshot(q, s => cb(wrapSnap(s)), e => err && err(errCode(e)));
  const db = {
    collection: path => ({ onSnapshot: (cb, err) => listen(F.collection(fs, path), cb, err) }),
    query: (path, field, value) => ({
      onSnapshot: (cb, err) => listen(F.query(F.collection(fs, path), F.where(field, "==", value)), cb, err),
      get: async () => wrapSnap(await timeout(F.getDocs(F.query(F.collection(fs, path), F.where(field, "==", value))), 12000))
    }),
    doc: path => wrapRef(F.doc(fs, path)),
    batchSet: async (items) => { // [{path, data}] en bloques de 400
      for (let i = 0; i < items.length; i += 400) {
        const b = F.writeBatch(fs);
        items.slice(i, i + 400).forEach(it => b.set(F.doc(fs, it.path), clean(it.data)));
        await write(b.commit());
      }
    }
  };
  let assets = null;
  if (St) {
    const storage = St.getStorage(app);
    assets = {
      upload: async file => {
        const id = Date.now().toString(36) + "-" + (file.name || "img").replace(/[^\w.-]/g, "_");
        const r = St.ref(storage, "gifs/" + id);
        try { await St.uploadBytes(r, file, { contentType: file.type }); }
        catch (e) { throw { code: e?.code === "storage/unauthorized" ? "not_granted" : "upstream_error" }; }
        return { id, url: await St.getDownloadURL(r) };
      }
    };
  }

  // ---------- Notificaciones push (Firebase Cloud Messaging + worker de Cloudflare) ----------
  const vapidKey = CFG.vapidKey || "", pushUrl = (CFG.pushUrl || "").replace(/\/+$/, "");
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const devId = () => { let d = ""; try { d = localStorage.getItem("entreno-dev") || ""; if (!d) { d = "d" + Math.random().toString(36).slice(2, 12); localStorage.setItem("entreno-dev", d); } } catch (e) { d = "d" + Math.random().toString(36).slice(2, 12); } return d; };
  let M = null;
  // App de Android (APK): trae su propio token de avisos nativos en ?fcm=... Se guarda y se usa en lugar del de Chrome.
  const NATIVE = (() => { try { const u = new URL(location.href), t = u.searchParams.get("fcm");
      if (t) { localStorage.setItem("entreno-native-fcm", t); u.searchParams.delete("fcm"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); }
      return localStorage.getItem("entreno-native-fcm") || ""; } catch (e) { return ""; } })();
  // ¿Se abrió desde el APK? Android lo marca en document.referrer la primera vez que carga.
  // El APK se anuncia con ?apk=VERSION (y ?fcmerr=... si Android no le dio token). Se guarda para el diagnóstico.
  const APK = (() => { try { const u = new URL(location.href), v = u.searchParams.get("apk"), er = u.searchParams.get("fcmerr");
      if (v) { localStorage.setItem("entreno-apk", v); localStorage.setItem("entreno-apk-err", er || ""); u.searchParams.delete("apk"); u.searchParams.delete("fcmerr"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); }
      else if (/^android-app:\/\/com\.entreno\./.test(document.referrer) && !localStorage.getItem("entreno-apk")) localStorage.setItem("entreno-apk", "1.0/1.1");
      return localStorage.getItem("entreno-apk") || ""; } catch (e) { return ""; } })();
  const token = async () => {
    if (NATIVE) return NATIVE;
    M = M || await import(base + "firebase-messaging.js");
    if (!(await M.isSupported())) throw { code: "unsupported" };
    const reg = await navigator.serviceWorker.ready;
    return M.getToken(M.getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
  };
  const saveToken = async (owner, t) => {
    await F.setDoc(F.doc(fs, `push/${owner}/devices/${devId()}`), { token: t, at: Date.now(), ua: navigator.userAgent.slice(0, 120), ...(NATIVE && t === NATIVE ? { native: "android" } : {}) });
    try { localStorage.setItem("entreno-push-owner", owner); } catch (e) {}
  };
  const push = {
    configured: !!(vapidKey && pushUrl),
    // "granted" | "default" | "denied" | "ios-home" (iPhone: falta agregar a inicio) | "unsupported" | "off" (sin configurar)
    state() {
      if (!vapidKey || !pushUrl) return "off";
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return isIOS && !standalone ? "ios-home" : "unsupported";
      return Notification.permission;
    },
    // v58: apagar/encender los avisos en este teléfono (sin tocar el permiso del navegador)
    isOff(owner) { try { return localStorage.getItem("entreno-push-off-" + owner) === "1"; } catch (e) { return false; } },
    async disable(owner) {
      try { localStorage.setItem("entreno-push-off-" + owner, "1"); } catch (e) {}
      try { await F.deleteDoc(F.doc(fs, `push/${owner}/devices/${devId()}`)); } catch (e) { console.warn("push off", e); }
      // no se borra el token del navegador: Tempo y Reps en el mismo cel comparten el mismo; solo se quita el registro de esta app
      return true;
    },
    async enable(owner) {
      if (!push.configured) throw { code: "off" };
      try { localStorage.removeItem("entreno-push-off-" + owner); } catch (e) {}
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw { code: perm === "denied" ? "denied" : "dismissed" };
      const t = await token(); await saveToken(owner, t); return true;
    },
    // v56: cada vez que se abre la app y el permiso ya está dado, vuelve a registrar este teléfono
    // (antes nunca se llamaba: si Firebase cambiaba el token o se borraban datos, el teléfono dejaba de recibir avisos)
    async refresh(owner) {
      try { if (!owner || push.state() !== "granted" || push.isOff(owner)) return; const t = await token(); await saveToken(owner, t); return t; } catch (e) { console.warn("push refresh", e); }
    },
    async send(msg) {
      if (!pushUrl) return { ok: false, status: 0, text: "sin pushUrl" }; const u = auth.currentUser; if (!u) return { ok: false, status: 0, text: "sin sesión" };
      try { const idToken = await u.getIdToken();
        const r = await fetch(pushUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken, ...msg }), keepalive: true });
        let text = ""; try { text = (await r.text()).slice(0, 300); } catch (e) {}
        return { ok: r.ok, status: r.status, text };
      } catch (e) { console.warn("push send", e); return { ok: false, status: 0, text: String(e?.message || e) }; }
    },
    // v56: diagnóstico paso a paso; target = a quién se manda la prueba del servidor ({to, cid})
    async diag(owner, target) {
      const out = [], add = (ok, t, d = "") => out.push({ ok, t, d });
      const ua = navigator.userAgent, inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/.test(ua);
      const br = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /EdgA?\//.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "otro";
      add(!inApp, "Navegador", `${br}${isIOS ? " · iPhone" : /Android/.test(ua) ? " · Android" : ""}${standalone ? " · app instalada" : " · pestaña del navegador"}${inApp ? " · ⚠ navegador dentro de otra app (WhatsApp/Instagram): ábrelo en Chrome" : ""}`);
      if (!vapidKey || !pushUrl) { add(false, "Configuración", "Falta vapidKey o pushUrl en firebase-config.js"); return out; }
      const st = push.state(); add(st === "granted", "Permiso", { granted: "concedido", default: "todavía no se ha pedido", denied: "bloqueado en el navegador", "ios-home": "iPhone: falta agregar a inicio", unsupported: "este navegador no permite avisos" }[st] || st);
      if (st !== "granted") return out;
      let reg = null;
      try { reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, j) => setTimeout(() => j(new Error("tiempo agotado")), 6000))]); add(!!reg?.active, "Service worker", reg?.active ? "activo · " + new URL(reg.scope).pathname : "sin activar"); }
      catch (e) { add(false, "Service worker", String(e.message || e)); return out; }
      let t = "";
      { let er = ""; try { er = localStorage.getItem("entreno-apk-err") || ""; } catch (e) {}
        if (APK && !NATIVE) add(false, "App de Android " + APK, "sin token nativo" + (er ? " · " + er : "") + ". Ajustes → Apps → Tempo → Forzar detención y ábrela otra vez");
        else if (APK || NATIVE) add(true, "App de Android " + APK, "avisos nativos activos");
        else add(true, "App de Android", "no: estás en Chrome o en la app instalada desde Chrome"); }
      try { t = await token(); add(!!t, NATIVE ? "Token nativo (app de Android)" : "Token de Firebase", t ? "…" + t.slice(-8) : "vacío"); } catch (e) { add(false, "Token de Firebase", (e?.code || "") + " " + (e?.message || "")); return out; }
      if (!NATIVE) try { const s = await reg.pushManager.getSubscription(); add(!!s, "Suscripción push", s ? new URL(s.endpoint).hostname : "no existe"); } catch (e) { add(false, "Suscripción push", String(e.message || e)); }
      try { await saveToken(owner, t); add(true, "Guardado en la base", `push/${owner}/devices/${devId()}`); } catch (e) { add(false, "Guardado en la base", (e?.code || "") + " " + (e?.message || "")); }
      try { await reg.showNotification("Prueba local ✓", { body: "Si ves esto, el teléfono sí muestra avisos de esta app.", tag: "diag-local", icon: new URL("icons/" + (owner === "trainer" ? "entrenador" : "cliente") + "-192.png", reg.scope).href }); add(true, "Aviso local", "enviado: debe aparecer arriba"); }
      catch (e) { add(false, "Aviso local", String(e.message || e)); }
      if (target) { const r = await push.send({ ...target, title: "Prueba del servidor ✓", body: "Si ves esto, los avisos llegan aunque la app esté cerrada.", url: owner === "trainer" ? "entrenador/" : "cliente/", test: true });
        const none = r.ok && /"sent":0/.test(r.text || "");
        add(r.ok && !none, "Servidor (Cloudflare)", none ? "respondió pero no envió nada (sent:0): el servidor no deja que el entrenador se mande avisos a sí mismo" : `HTTP ${r.status}${r.text ? " · " + r.text : ""}`); }
      return out;
    }
  };
  let current = null; const subs = new Set();
  A.onAuthStateChanged(auth, u => { current = u; subs.forEach(f => f(u)); });
  await auth.authStateReady?.();
  const api = {
    configured: true, db, assets, push,
    auth: {
      get user() { return current || auth.currentUser || null; },
      onUser: f => { subs.add(f); f(current); return () => subs.delete(f); },
      google: async () => {
        const p = new A.GoogleAuthProvider();
        try { await A.signInWithPopup(auth, p); }
        catch (e) { if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") await A.signInWithRedirect(auth, p); else throw e; }
      },
      // En iPhone el aviso de sesión puede llegar después: usamos el usuario que devuelve el inicio de sesión
      anon: async () => { const c = await A.signInAnonymously(auth); if (c?.user) current = c.user; return c; },
      ensure: async () => { const u = current || auth.currentUser; if (u) return u; const c = await A.signInAnonymously(auth); current = c.user; return c.user; },
      out: () => A.signOut(auth)
    }
  };
  done(api);
}
start().catch(e => { console.error(e); done({ configured: false, error: String(e?.message || e) }); });
