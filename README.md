# Click Download — Android Native v2

This is a real Android Native (Kotlin) app. It is NOT a WebView.

## Test backend
The app is already configured to use:
`https://clicktestload.netlify.app`

It calls:
- `POST /api/download` to resolve supported media links.
- The returned media URL is downloaded by Android DownloadManager.

## AdMob
The project currently uses Google's official TEST App ID / Banner / Interstitial IDs.
Do not publish with these IDs. Replace them with your real AdMob IDs before Play Store release.

## Build
Open the folder in Android Studio and run the app on an Android phone/emulator.

## Test flow
1. Paste a supported URL.
2. Tap `Jwenn Videyo`.
3. Choose video or music.
4. A test interstitial may appear.
5. Android DownloadManager starts the download.

The original Netlify functions are included under `netlify/functions` for reference/deployment.
