// ─────────────────────────────────────────────────────────────────────────
//  ALL INTRO TEXT LIVES HERE. Edit this file to change what the intro says.
// ─────────────────────────────────────────────────────────────────────────
//
// The intro runs: title card -> climb_1 -> text -> climb_2 -> text -> ...
// Each clip plays to the end, freezes on its last frame, and then its `text`
// fades in. Space advances (and skips ahead if a clip is still playing).
//
// To add another leg of the climb, drop climb_5.mp4 in public/climb and add
// another entry to BEATS. Order in this array is the order they play in.

export const TITLE = {
  image: '/church_monserrate.png',
  title: 'Bailar con Colombia',
  subtitle: 'Un baile en la cima de Monserrate',
  hint: 'press space to begin',
}

export const BEATS = [
  {
    video: '/climb/climb_1.mp4',
    text: '¡Hola compañero! On the grandiose slopes of Monserrate,' +
        ' the greatest quinceañera Colombia has ever seen is taking place,' +
        ' and it\'s hosted by none other than Seniorita Cabí',
  },
  {
    video: '/climb/climb_2.mp4',
    text: 'Cabí loves salsa, both comida como el baile',
  },
  {
    video: '/climb/climb_3.mp4',
    text: 'It\'s your job to make her fiesta the best one ever. You will dance with Senor Emp, el empanada es muy fuerte, y guapo ',
  },
  {
    video: '/climb/climb_4.mp4',
    text: 'This is your opportunity to become the best salsa bailando el mundo mirar, from the bonito montañas de Bogotá',
    hint: 'press space to BAILARRR',
  },
]

// Music for the intro and the game lobby: it starts on the title card, carries
// through the climb, and keeps playing until a game actually starts -- then the
// track chosen from public/game-music takes over and it comes back once the
// game is over. Set INTRO_MUSIC to null for a silent intro.
export const INTRO_MUSIC = '/music/shakira.mp3'
export const INTRO_MUSIC_VOLUME = 0.55

// Shown under every beat that does not set its own `hint`.
export const DEFAULT_HINT = 'space to continue'

// The climb clips try to play with sound. Browsers only allow that after the
// player has interacted with the page — pressing space to start counts — and
// if it is refused anyway the clip falls back to muted rather than stalling.
// Set to false to keep the climb silent.
export const CLIMB_AUDIO = true
