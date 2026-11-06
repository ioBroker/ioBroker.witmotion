/**
 * The words the element shows, in the languages of ioBroker.
 *
 * The words of the native widgets (`src-shared/i18n`) are picked by the build (`VIEW_WORDS`) and handed in as
 * `__WIT_WORDS__`, without the prefix `wit_`. Only the hints of the web component are here.
 */
import type { ViewWord } from './constants';

/** Set by `vite.config.ts`: language -> word of the native widgets -> text */
declare const __WIT_WORDS__: Record<string, Partial<Record<ViewWord, string>>>;

const VIEW_WORDS = __WIT_WORDS__;

const EN = {
    chooseInstance: 'Choose a WitMotion instance in the settings',
    noAngles: 'No angles: enable the magnetometer in the settings of the instance',
};

export type HintWord = keyof typeof EN;

const HINTS: Record<string, Record<HintWord, string>> = {
    en: EN,
    de: {
        chooseInstance: 'WitMotion-Instanz in den Einstellungen wählen',
        noAngles: 'Keine Winkel: Magnetometer in den Einstellungen der Instanz aktivieren',
    },
    ru: {
        chooseInstance: 'Выберите экземпляр WitMotion в настройках',
        noAngles: 'Нет углов: включите магнитометр в настройках экземпляра',
    },
    pt: {
        chooseInstance: 'Escolha uma instância WitMotion nas configurações',
        noAngles: 'Sem ângulos: ative o magnetômetro nas configurações da instância',
    },
    nl: {
        chooseInstance: 'Kies een WitMotion-instantie in de instellingen',
        noAngles: 'Geen hoeken: schakel de magnetometer in de instellingen van de instantie in',
    },
    fr: {
        chooseInstance: 'Choisissez une instance WitMotion dans les paramètres',
        noAngles: "Pas d'angles : activez le magnétomètre dans les paramètres de l'instance",
    },
    it: {
        chooseInstance: "Scegli un'istanza WitMotion nelle impostazioni",
        noAngles: "Nessun angolo: attiva il magnetometro nelle impostazioni dell'istanza",
    },
    es: {
        chooseInstance: 'Elija una instancia de WitMotion en la configuración',
        noAngles: 'Sin ángulos: active el magnetómetro en la configuración de la instancia',
    },
    pl: {
        chooseInstance: 'Wybierz instancję WitMotion w ustawieniach',
        noAngles: 'Brak kątów: włącz magnetometr w ustawieniach instancji',
    },
    uk: {
        chooseInstance: 'Виберіть екземпляр WitMotion у налаштуваннях',
        noAngles: 'Немає кутів: увімкніть магнітометр у налаштуваннях екземпляра',
    },
    'zh-cn': {
        chooseInstance: '请在设置中选择 WitMotion 实例',
        noAngles: '没有角度：请在实例设置中启用磁力计',
    },
};

/**
 * A word of the native widgets in a language; a word that is missing there is taken in English
 *
 * @param lang the language of the system
 * @param word which word
 */
export function getWord(lang: ioBroker.Languages, word: ViewWord): string {
    return VIEW_WORDS[lang]?.[word] || VIEW_WORDS.en?.[word] || word;
}

/**
 * A hint of the element in a language
 *
 * @param lang the language of the system
 * @param word which hint
 */
export function getHint(lang: ioBroker.Languages, word: HintWord): string {
    return (HINTS[lang] || EN)[word] || EN[word];
}
