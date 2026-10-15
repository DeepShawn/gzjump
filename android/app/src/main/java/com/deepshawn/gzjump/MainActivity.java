package com.deepshawn.gzjump;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Window;
import android.graphics.Color;

public final class MainActivity extends Activity {
  private WebView webView;
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    Window window = getWindow();
    window.setStatusBarColor(Color.rgb(195,229,220));
    window.getDecorView().setSystemUiVisibility(8192);
    webView = new WebView(this); setContentView(webView);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setDatabaseEnabled(true); settings.setSupportZoom(false);
    settings.setUserAgentString(settings.getUserAgentString() + " GZJumpAndroid/1.0");
    CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
    webView.setWebViewClient(new WebViewClient()); webView.loadUrl("https://deepshawn.github.io/gzjump/?platform=android");
  }
  @Override public void onBackPressed() { if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
}
