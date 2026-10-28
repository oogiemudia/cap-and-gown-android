package io.github.oogiemudia.capgown;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** AlarmManager fires this. It starts the ringing service, then sets the next planned alarm. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String payload = intent.getStringExtra("alarm");
        if (payload == null) payload = "{\"title\":\"Study time\",\"lines\":[]}";
        Intent ring = new Intent(context, AlarmService.class)
                .setAction(AlarmService.ACTION_RING)
                .putExtra("alarm", payload);
        try {
            context.startForegroundService(ring);
        } catch (Exception e) {
            // Android refused to start the ringing service. Show a loud notification instead.
            AlarmService.fallbackNotify(context, payload);
        }
        Alarms.scheduleNext(context);
    }
}
