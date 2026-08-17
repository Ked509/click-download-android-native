package com.clickdownload.app

import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.AdError
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private lateinit var urlInput: EditText
    private lateinit var getButton: Button
    private lateinit var videoButton: Button
    private lateinit var musicButton: Button
    private lateinit var progress: ProgressBar
    private lateinit var status: TextView
    private lateinit var resultPanel: LinearLayout
    private lateinit var title: TextView
    private lateinit var author: TextView
    private lateinit var bannerAd: AdView
    private var videoUrl: String? = null
    private var musicUrl: String? = null
    private var interstitial: InterstitialAd? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        urlInput = findViewById(R.id.urlInput)
        getButton = findViewById(R.id.getButton)
        videoButton = findViewById(R.id.videoDownload)
        musicButton = findViewById(R.id.musicDownload)
        progress = findViewById(R.id.progress)
        status = findViewById(R.id.status)
        resultPanel = findViewById(R.id.resultPanel)
        title = findViewById(R.id.title)
        author = findViewById(R.id.author)
        bannerAd = findViewById(R.id.bannerAd)

        MobileAds.initialize(this) {}
        bannerAd.loadAd(AdRequest.Builder().build())
        loadInterstitial()

        findViewById<Button>(R.id.pasteButton).setOnClickListener { paste() }
        getButton.setOnClickListener { fetchMedia() }
        videoButton.setOnClickListener { videoUrl?.let { showAdThen { download(it, "click-download-video.mp4") } } }
        musicButton.setOnClickListener { musicUrl?.let { showAdThen { download(it, "click-download-music.mp3") } } }
    }

    private fun paste() {
        val cb = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val text = cb.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
        if (text.isNotBlank()) urlInput.setText(text)
    }

    private fun fetchMedia() {
        val input = urlInput.text.toString().trim()
        if (input.isBlank()) { status.text = "Tanpri kole yon lyen dabò."; return }
        if (!input.startsWith("http://") && !input.startsWith("https://")) { status.text = "Lyen an pa valab."; return }

        resultPanel.visibility = View.GONE
        progress.visibility = View.VISIBLE
        status.text = "⏳ Ap chèche videyo a..."
        getButton.isEnabled = false

        thread {
            try {
                val endpoint = BuildConfig.API_BASE_URL.trimEnd('/') + "/api/download"
                val conn = URL(endpoint).openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.connectTimeout = 15000
                conn.readTimeout = 30000
                conn.doOutput = true
                conn.outputStream.use { it.write(JSONObject().put("url", input).toString().toByteArray(Charsets.UTF_8)) }

                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val body = stream.bufferedReader().use { it.readText() }
                if (code !in 200..299) throw Exception(JSONObject(body).optString("error", "Sèvis la pa t kapab jwenn videyo a."))
                val json = JSONObject(body)
                if (!json.optBoolean("success", false)) throw Exception(json.optString("error", "Pa t jwenn videyo a."))

                videoUrl = json.optString("video_no_watermark").takeIf { it.isNotBlank() }
                musicUrl = json.optString("music").takeIf { it.isNotBlank() }
                val t = json.optString("title").ifBlank { "Videyo" }
                val a = json.optString("author")
                runOnUiThread {
                    title.text = t
                    author.text = if (a.isBlank()) "" else "Pa @$a"
                    videoButton.visibility = if (videoUrl == null) View.GONE else View.VISIBLE
                    musicButton.visibility = if (musicUrl == null) View.GONE else View.VISIBLE
                    resultPanel.visibility = View.VISIBLE
                    status.text = "✅ Videyo a pare."
                }
            } catch (e: Exception) {
                runOnUiThread { status.text = "❌ ${e.message ?: "Yon erè rive."}" }
            } finally {
                runOnUiThread { progress.visibility = View.GONE; getButton.isEnabled = true }
            }
        }
    }

    private fun loadInterstitial() {
        InterstitialAd.load(this, "ca-app-pub-3940256099942544/1033173712", AdRequest.Builder().build(), object : InterstitialAdLoadCallback() {
            override fun onAdLoaded(ad: InterstitialAd) { interstitial = ad }
            override fun onAdFailedToLoad(error: LoadAdError) { interstitial = null }
        })
    }

    private fun showAdThen(action: () -> Unit) {
        val ad = interstitial
        if (ad == null) { action(); loadInterstitial(); return }
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() { interstitial = null; action(); loadInterstitial() }
            override fun onAdFailedToShowFullScreenContent(error: AdError) { interstitial = null; action(); loadInterstitial() }
        }
        ad.show(this)
    }

    private fun download(mediaUrl: String, filename: String) {
        try {
            val request = DownloadManager.Request(Uri.parse(mediaUrl))
                .setTitle(filename)
                .setDescription("Click Download")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
            val dm = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            Toast.makeText(this, "Download lan kòmanse.", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Telechajman an echwe: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
