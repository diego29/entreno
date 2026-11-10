package com.entreno.tempo;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Avisos nativos de Android (Firebase Cloud Messaging directo a la app, sin pasar por Chrome). */
public class PushService extends FirebaseMessagingService {
    static final String CHANNEL = "avisos";
    static final String SITE = "https://entreno.d13g0manuel.workers.dev/";

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Avisos de Tempo", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Entrenamientos, descansos y mensajes de tus clientes");
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }

    static void saveToken(Context c, String t) {
        if (t != null) c.getSharedPreferences("push", MODE_PRIVATE).edit().putString("token", t).apply();
    }

    static String token(Context c) {
        return c.getSharedPreferences("push", MODE_PRIVATE).getString("token", "");
    }

    @Override
    public void onNewToken(String t) { saveToken(this, t); }

    @Override
    public void onMessageReceived(RemoteMessage m) {
        Map<String, String> d = m.getData();
        String title = d.get("title"), body = d.get("body"), url = d.get("url"), tag = d.get("tag");
        RemoteMessage.Notification n = m.getNotification();
        if (n != null) {
            if (title == null) title = n.getTitle();
            if (body == null) body = n.getBody();
        }
        if (title == null && body == null) return;
        show(title, body, url, tag);
    }

    private void show(String title, String body, String url, String tag) {
        ensureChannel(this);
        String target = url == null || url.isEmpty() ? SITE + "entrenador/" : url.startsWith("http") ? url : SITE + url.replaceFirst("^/+", "");
        Intent i = new Intent(this, LauncherActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(Uri.parse(target));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int id = tag != null ? tag.hashCode() : (int) (System.currentTimeMillis() & 0x7fffffff);
        PendingIntent pi = PendingIntent.getActivity(this, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title == null ? "Tempo" : title)
                .setContentText(body == null ? "" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body == null ? "" : body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(pi);
        try { NotificationManagerCompat.from(this).notify(id, b.build()); } catch (SecurityException ignored) { }
    }
}
