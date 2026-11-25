const trackCount = 10;
const preferenceKey = 'wish-garden-background-music';
const buttons = Array.from(document.querySelectorAll('[data-music-toggle]'));
const audio = document.getElementById('background-music');

let track = 1;
let requested = false;
let failedTracks = 0;

function readPreference() {
    try { return localStorage.getItem(preferenceKey) !== 'off'; }
    catch { return true; }
}

function savePreference(enabled) {
    try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); }
    catch { /* Sound controls still work when storage is blocked. */ }
}

function syncButtons() {
    const playing = !audio.paused && !audio.ended;
    for (const button of buttons) {
        button.textContent = playing ? '음악 끄기' : '음악 켜기';
    }
}

function loadTrack() {
    audio.src = new URL(`./music/carol-${String(track).padStart(2, '0')}.mp3`, import.meta.url).href;
}

function play() {
    if (!audio.src) loadTrack();
    void audio.play().catch(syncButtons);
}

function advance() {
    track = track % trackCount + 1;
    loadTrack();
    if (requested && !document.hidden) play();
}

let autoStart = readPreference();
document.addEventListener('click', event => {
    if (!autoStart || (event.target instanceof Element && event.target.closest('[data-music-toggle]'))) return;
    autoStart = false;
    requested = true;
    play();
}, { capture: true });

for (const button of buttons) {
    button.addEventListener('click', () => {
        autoStart = false;
        requested = audio.paused || audio.ended;
        savePreference(requested);
        if (requested) {
            if (failedTracks) loadTrack();
            failedTracks = 0;
            play();
        } else {
            audio.pause();
        }
        syncButtons();
    });
}

audio.addEventListener('play', syncButtons);
audio.addEventListener('pause', syncButtons);
audio.addEventListener('playing', () => { failedTracks = 0; });
audio.addEventListener('ended', () => {
    if (requested) advance();
    syncButtons();
});
audio.addEventListener('error', () => {
    failedTracks++;
    if (requested && failedTracks < trackCount) advance();
    else requested = false;
    syncButtons();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else if (requested) play();
});
syncButtons();
