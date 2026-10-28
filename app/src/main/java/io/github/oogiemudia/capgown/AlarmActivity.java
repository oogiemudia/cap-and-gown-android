package io.github.oogiemudia.capgown;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.Date;

/** The full-screen alarm: shows tonight's steps with Open planner, Snooze and Stop. */
public class AlarmActivity extends Activity {

    private static WeakReference<AlarmActivity> current;
    private String payload;

    static void closeIfOpen() {
        AlarmActivity a = current == null ? null : current.get();
        if (a != null && !a.isFinishing()) a.finish();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        current = new WeakReference<>(this);
        show(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        show(intent);
    }

    @Override
    protected void onDestroy() {
        if (current != null && current.get() == this) current = null;
        super.onDestroy();
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(String s, float sp, int colour, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(colour);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setLineSpacing(0, 1.15f);
        return t;
    }

    private Button button(String label, int fill, int ink, int stroke) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(ink);
        b.setMinHeight(dp(60));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(18));
        bg.setColor(fill);
        if (stroke != 0) bg.setStroke(dp(2), stroke);
        b.setBackground(bg);
        b.setStateListAnimator(null);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        b.setLayoutParams(lp);
        return b;
    }

    private void show(Intent intent) {
        payload = intent == null ? null : intent.getStringExtra("alarm");
        JSONObject o = AlarmService.parse(payload);

        int bg = Color.parseColor("#14121F");
        int ink = Color.WHITE;
        int soft = Color.parseColor("#C9C4DA");
        int accent = Color.parseColor("#FF7A2F");

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(24), dp(40), dp(24), dp(32));
        col.setBackgroundColor(bg);

        TextView clock = text(DateFormat.getTimeFormat(this).format(new Date()), 64, ink, true);
        clock.setGravity(Gravity.CENTER_HORIZONTAL);
        col.addView(clock);

        TextView title = text(AlarmService.title(o), 26, ink, true);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        title.setPadding(0, dp(8), 0, dp(20));
        col.addView(title);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(16), dp(18), dp(16));
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setCornerRadius(dp(18));
        cardBg.setColor(Color.parseColor("#221E33"));
        card.setBackground(cardBg);
        JSONArray lines = o.optJSONArray("lines");
        if (lines == null || lines.length() == 0) {
            card.addView(text("Open the planner to see tonight's steps.", 18, soft, false));
        } else {
            for (int i = 0; i < lines.length(); i++) {
                TextView line = text("•  " + lines.optString(i), 18, i == 0 ? ink : soft, false);
                line.setPadding(0, i == 0 ? 0 : dp(8), 0, 0);
                card.addView(line);
            }
        }
        col.addView(card);

        Button open = button("Open planner", accent, Color.parseColor("#1A1020"), 0);
        open.setOnClickListener(v -> {
            sendToService(AlarmService.ACTION_STOP);
            Intent i = new Intent(this, MainActivity.class)
                    .putExtra("view", "today")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(i);
            finish();
        });
        LinearLayout.LayoutParams first = (LinearLayout.LayoutParams) open.getLayoutParams();
        first.topMargin = dp(28);
        col.addView(open);

        Button snooze = button("Snooze " + AlarmService.SNOOZE_MINUTES + " minutes", Color.parseColor("#2E2945"), ink, 0);
        snooze.setOnClickListener(v -> {
            sendToService(AlarmService.ACTION_SNOOZE);
            finish();
        });
        col.addView(snooze);

        Button stop = button("Stop for now", Color.TRANSPARENT, soft, Color.parseColor("#4A4463"));
        stop.setOnClickListener(v -> {
            sendToService(AlarmService.ACTION_STOP);
            finish();
        });
        col.addView(stop);

        TextView note = text("If you do nothing it stops after five minutes and rings again ten minutes later.", 14, soft, false);
        note.setPadding(0, dp(20), 0, 0);
        note.setGravity(Gravity.CENTER_HORIZONTAL);
        col.addView(note);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(bg);
        scroll.addView(col);
        scroll.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        setContentView(scroll);
    }

    private void sendToService(String action) {
        Intent i = new Intent(this, AlarmService.class).setAction(action);
        if (payload != null) i.putExtra("alarm", payload);
        try {
            startService(i);
        } catch (Exception ignored) { }
    }
}
