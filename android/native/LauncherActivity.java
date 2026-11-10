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
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        PushService.ensureChannel(this);
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t -> PushService.saveToken(this, t));
        } catch (Exception ignored) { }
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
