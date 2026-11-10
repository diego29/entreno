package com.entreno.tempo;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.google.firebase.messaging.FirebaseMessaging;

/** Abre Tempo a pantalla completa y le pasa a la página el token de avisos nativos (?fcm=...). */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private boolean launched = false;

    /** Si todavía no tenemos el token de avisos, esperamos a que llegue (máximo 4 s) antes de abrir Tempo, para pasárselo desde la primera vez. */
    @Override
    protected boolean shouldLaunchImmediately() {
        return !PushService.token(this).isEmpty();
    }

    private void launchOnce() {
        if (launched || isFinishing()) return;
        launched = true;
        launchTwa();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        PushService.ensureChannel(this);
        final boolean waiting = PushService.token(this).isEmpty();
        if (!waiting) launched = true;
        try {
            FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(t -> { PushService.saveToken(this, t); if (waiting) launchOnce(); })
                .addOnFailureListener(e -> { if (waiting) launchOnce(); });
        } catch (Exception e) { if (waiting) new android.os.Handler(android.os.Looper.getMainLooper()).post(this::launchOnce); }
        if (waiting) new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(this::launchOnce, 4000);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();
        String tok = PushService.token(this);
        if (uri != null && !tok.isEmpty()) uri = uri.buildUpon().appendQueryParameter("fcm", tok).build();
        return uri;
    }
}
