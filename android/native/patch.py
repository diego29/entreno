# Agrega avisos nativos (Firebase Cloud Messaging) al proyecto que genera Bubblewrap.
# Solo corre si existe android/google-services.json (se baja de Firebase → Configuración del proyecto → app Android com.entreno.tempo).
import os,re,shutil,sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
def sub(path,old,new,count=1,regex=False):
    s=open(path).read();n=len(re.findall(old,s)) if regex else s.count(old)
    if not n:sys.exit(f'No encontré en {path}: {old}')
    s=re.sub(old,new,s,count=count) if regex else s.replace(old,new,count);open(path,'w').write(s)
sub('build.gradle',r"(classpath 'com\.android\.tools\.build:gradle:[^']+')",r"\1\n        classpath 'com.google.gms:google-services:4.4.2'",regex=True)
sub('app/build.gradle',r"(implementation 'com\.google\.androidbrowserhelper:androidbrowserhelper:[^']+')",
    r"\1\n    implementation platform('com.google.firebase:firebase-bom:33.7.0')\n    implementation 'com.google.firebase:firebase-messaging'",regex=True)
open('app/build.gradle','a').write("\napply plugin: 'com.google.gms.google-services'\n")
sub('app/src/main/AndroidManifest.xml','</application>','''    <service android:name=".PushService" android:exported="false">
            <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT" /></intent-filter>
        </service>
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="avisos" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_notification_icon" />
    </application>''')
src='app/src/main/java/com/entreno/tempo/'
for f in ('LauncherActivity.java','PushService.java'):shutil.copy('native/'+f,src+f)
shutil.copy('google-services.json','app/google-services.json')
print('Avisos nativos agregados')
