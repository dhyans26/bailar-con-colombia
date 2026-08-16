import { publicAsset } from './publicAsset.js'

export const TITLE = {
  image: publicAsset('/church_monserrate.png'),
  // the logo carries the title and "En Bogotá" line, so no heading text here
  logo: publicAsset('/logo.png'),
  title: 'Salsa para Cabí',
  // the prompt is drawn art on the title card; the text doubles as its alt
  hintImage: publicAsset('/instructions_space.png'),
  hint: 'press space to begin',
}

export const BEATS = [
  {
    video: publicAsset('/climb/climb_1.mp4'),
    text: '¡Hola compañero! On the grandiose slopes of Monserrate,' +
        ' the greatest quinceañera Colombia has ever seen is taking place,' +
        ' and it\'s hosted by none other than Seniorita Cabí',
  },
  {
    video: publicAsset('/climb/climb_2.mp4'),
    text: 'Cabí loves salsa, both comida como el baile',
  },
  {
    video: publicAsset('/climb/climb_3.mp4'),
    text: 'It\'s your job to make her fiesta the best one ever. You will dance with Senor Emp, el empanada es muy fuerte, y guapo ',
  },
  {
    video: publicAsset('/climb/climb_4.mp4'),
    text: 'This is your opportunity to become the best salsa bailando el mundo mirar, from the bonito montañas de Bogotá',
    hint: 'press space to BAILARRR',
  },
]

export const INTRO_MUSIC = publicAsset('/music/shakira.mp3')
export const INTRO_MUSIC_VOLUME = 0.55

export const DEFAULT_HINT = 'space to continue'

// The climb clips try to play with sound
export const CLIMB_AUDIO = true

// ---------- end-screen license cutscene ----------

export const LICENSE_SCORE_THRESHOLD = 0

// {score}, {maxScore}, {threshold} are interpolated by EndCutscene.
export const LICENSE_DIALOGUE_PASS = [
  { speaker: 'Cabí', text: '¡Ay, mira nada más! You really brought it out there on that floor.' },
  { speaker: 'Empanada', text: '¡Fuerte y guapo bailando, mi amigo! I knew you had it in you.' },
  { speaker: 'Cabí', text: 'Fuerte, sí... pero also actually on beat, for once.' },
  { speaker: 'Cabí', text: '{score} de {maxScore} puntos es más que suficiente.' },
  { speaker: 'Cabí', text: 'Con esto, te doy tu licencia oficial de salsa. ¡Baila donde quieras, bailarín!' },
  { speaker: 'Empanada', text: '¡Vamos a bailar otra vez pronto! El mundo entero nos espera :))' },
]

export const LICENSE_DIALOGUE_FAIL = [
  { speaker: 'Cabí', text: 'Mmm... mi amor, that was... an effort.' },
  { speaker: 'Empanada', text: '¡Fuerte y guapo bailando, pero maybe not on beat!' },
  { speaker: 'Cabí', text: '{score} de {maxScore} puntos — neccesitas más que {threshold} para la licencia.' },
  { speaker: 'Cabí', text: 'Practice those caderas and come back to me.' },
  { speaker: 'Empanada', text: '¡La próxima vez! I know you\'ll be muy on beat.' },
]

// drop your license artwork in frontend/public/ at this path
export const LICENSE_IMAGE = publicAsset('/salsa-license.png')
