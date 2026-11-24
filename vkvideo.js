(function () {
    'use strict';

    if (window.vkvideo_plugin) return;

    window.vkvideo_plugin = true;

    // Полифиллы безопасной работы селекторов в ядре Lampa (защита Navigator / Controller от TypeError: element.toggleClass is not a function)
    var polyMethods = ['toggleClass', 'removeClass', 'addClass', 'hasClass'];
    polyMethods.forEach(function (method) {
        if (typeof Object.prototype[method] !== 'function') {
            try {
                Object.defineProperty(Object.prototype, method, {
                    value: function (classes, status) {
                        if (this && this.classList) {
                            var el = this;
                            (classes || '').split(' ').forEach(function (c) {
                                if (!c) return;
                                var has = el.classList.contains(c);
                                if (method === 'toggleClass') {
                                    if (status && !has) el.classList.add(c);
                                    else if (!status && has) el.classList.remove(c);
                                } else if (method === 'addClass') {
                                    el.classList.add(c);
                                } else if (method === 'removeClass') {
                                    el.classList.remove(c);
                                }
                            });
                            if (method === 'hasClass') {
                                return el.classList.contains(classes);
                            }
                        }
                        return method === 'hasClass' ? false : this;
                    },
                    writable: true,
                    configurable: true,
                    enumerable: false
                });
            } catch (e) {}
        }
    });

    // Прямой клиент VK Video (без сторонних серверов и Vercel)
    var CLIENT_ID = '52461373';
    // Версия 5.236 гарантированно поддерживает JSONP-коллбэки
    var API_VERSION = '5.236';
    var API_URL = 'https://api.vkvideo.ru/method/';
    var CATALOG_URL = 'https://vkvideo.ru/';
    var PLAYER_ORIGIN = 'https://vkvideo.ru';
    var EMBED_PARAMS = 'partner_name=lampa&js_api=1';
    var MENU_TITLE = 'VK Видео';
    var TOKEN_KEY = 'vkvideo_token';
    // Токен живёт сутки. Если осталось меньше часа — обновляем
    var TOKEN_PROLONG_LEFT = 23 * 3600 * 1000;
    var HISTORY_SOURCE = 'vkvideo';
    var HISTORY_SIZE = 20;
    var TIMEOUT = 12000;
    var THROTTLE_MS = 280;
    var RESOLVE_TTL = 20 * 60 * 1000;
    var PROGRESS_KEY = 'vkvideo_progress';
    var SHELF_SIZE = 40;
    var SHELVES_PER_BATCH = 3;
    var COMMENTS_PER_PAGE = 20;

    // Актуальные вкладки VK Видео
    var SHOWCASES = [
        {url: 'https://vkvideo.ru/trends', title: 'Тренды'},
        {url: 'https://vkvideo.ru/lives', title: 'Трансляции'},
        {url: 'https://vkvideo.ru/for_kids', title: 'Детям'},
        {url: 'https://vkvideo.ru/movies_serials', title: 'Фильмы и сериалы'},
        {url: 'https://vkvideo.ru/tvchannels', title: 'Телеканалы'}
    ];

    var ICON_MENU = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="4.5" width="19" height="15" rx="4.5" stroke="currentColor" stroke-width="2"/><path d="M10 9.27v5.46c0 .46.5.75.9.52l4.73-2.73a.6.6 0 0 0 0-1.04L10.9 8.75a.6.6 0 0 0-.9.52z" fill="currentColor"/></svg>';
    var ICON_LIKE = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2.1 0 3.6 1.2 5.4 3 1.8-1.8 3.3-3 5.4-3C21 5 23 8.6 21.6 11.8 19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>';
    var ICON_VERIFIED = '<svg viewBox="0 0 24 24"><path d="M12 1.5l2.6 2 3.3-.2 1 3.1 2.7 1.9-1 3.2 1 3.1-2.7 1.9-1 3.1-3.3-.2-2.6 2-2.6-2-3.3.2-1-3.1-2.7-1.9 1-3.1-1-3.2 2.7-1.9 1-3.1 3.3.2z" fill="currentColor"/><path d="M7.8 12.3l2.8 2.8 5.6-5.6" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var ICON_SEARCH = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
    var ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

    var STYLE = [
        '.items-line .card--vkvideo { width: 21em; }',
        '.card--vkvideo .card__view { padding-bottom: 56.25%; margin-bottom: 0.7em; }',
        '.card--vkvideo .card__img { object-fit: cover; }',
        '.card--vkvideo .card__title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; max-height: 2.6em; }',
        '.card--vkvideo .card__age { margin-top: 0.35em; font-size: 0.9em; opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.card__vkvideo-badge { position: absolute; right: 0.6em; bottom: 0.6em; padding: 0.2em 0.45em; border-radius: 0.4em; background: rgba(0, 0, 0, 0.75); font-size: 0.85em; font-weight: 600; line-height: 1.2; }',
        '.card__vkvideo-badge--live { background: #ff3347; }',
        '.card__vkvideo-progress { position: absolute; left: 0.6em; top: 0.6em; padding: 0.2em 0.45em; border-radius: 0.4em; background: rgba(0, 119, 255, 0.9); font-size: 0.8em; font-weight: 600; line-height: 1.2; color: #fff; z-index: 2; pointer-events: none; }',
        '.card__vkvideo-progress--done { background: rgba(0, 0, 0, 0.75); }',
        '.card--vkvideo-search .card__view { background: rgba(255, 255, 255, 0.08); }',
        '.card--vkvideo-search svg { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 3em; height: 3em; opacity: 0.8; }',
        '.card--vkvideo-search .card__age { display: none !important; }',
        '@media screen and (max-width: 480px) { .items-line .card--vkvideo { width: 18em; } }',

        '.vkvideo-watch { padding: 0 1.5em 3em; }',
        '.vkvideo-watch__inner { margin: 0 auto; }',
        '.vkvideo-watch__buttons { display: flex; gap: 0.8em; margin-bottom: 0.8em; }',
        '.vkvideo-watch__back, .vkvideo-watch__native { margin-bottom: 0; }',
        '@media screen and (min-width: 768px) and (min-height: 480px) { .vkvideo-watch__inner { max-width: calc((100vh - 17em) * 1.7778); } }',
        '.vkvideo-watch__player { position: relative; padding-top: 56.25%; background: #000; border-radius: 1em; overflow: hidden; }',
        '.vkvideo-watch__player.focus { box-shadow: 0 0 0 0.2em #fff; }',
        '.vkvideo-watch__player iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }',
        '.vkvideo-watch__title { margin-top: 0.8em; font-size: 1.6em; font-weight: 600; line-height: 1.3; }',
        '.vkvideo-watch__stats { margin-top: 0.4em; color: rgba(255, 255, 255, 0.6); }',
        '.vkvideo-watch__stats svg, .vkvideo-watch__verified svg { width: 1em; height: 1em; vertical-align: -0.12em; }',
        '.vkvideo-watch__likes { margin-left: 0.2em; }',
        '.vkvideo-watch__channel { display: flex; align-items: center; margin-top: 1.2em; }',
        '.vkvideo-watch__avatar, .vkvideo-comment__avatar { flex-shrink: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.1) center / cover no-repeat; }',
        '.vkvideo-watch__avatar { width: 3em; height: 3em; margin-right: 0.9em; }',
        '.vkvideo-watch__channel-name { font-size: 1.15em; font-weight: 600; }',
        '.vkvideo-watch__verified { margin-left: 0.3em; color: #99a2ad; }',
        '.vkvideo-watch__channel-sub { margin-top: 0.2em; font-size: 0.9em; color: rgba(255, 255, 255, 0.5); }',
        '.vkvideo-watch__desc { margin: 1.2em -0.8em 0; padding: 0.8em; border-radius: 1em; background: rgba(255, 255, 255, 0.06); }',
        '.vkvideo-watch__desc.focus { background: rgba(255, 255, 255, 0.14); }',
        '.vkvideo-watch__desc-text { white-space: pre-line; word-wrap: break-word; line-height: 1.45; max-height: 4.35em; overflow: hidden; }',
        '.vkvideo-watch__desc.expanded .vkvideo-watch__desc-text { max-height: none; }',
        '.vkvideo-watch__desc-toggle { margin-top: 0.4em; font-weight: 600; }',
        '.vkvideo-watch__comments-head { margin-top: 1.8em; font-size: 1.3em; font-weight: 600; }',
        '.vkvideo-watch__comments-head span { margin-left: 0.4em; color: rgba(255, 255, 255, 0.5); font-weight: 400; }',
        '.vkvideo-watch__note { margin-top: 1em; color: rgba(255, 255, 255, 0.5); }',
        '.vkvideo-watch__more { display: inline-flex; margin-top: 1em; }',
        '.vkvideo-comment { display: flex; margin: 0.6em -0.8em 0; padding: 0.6em 0.8em; border-radius: 1em; }',
        '.vkvideo-comment.focus { background: rgba(255, 255, 255, 0.08); }',
        '.vkvideo-comment__avatar { width: 2.4em; height: 2.4em; margin-right: 0.8em; }',
        '.vkvideo-comment__body { min-width: 0; }',
        '.vkvideo-comment__name { font-weight: 600; }',
        '.vkvideo-comment__date { margin-left: 0.5em; font-size: 0.85em; color: rgba(255, 255, 255, 0.45); }',
        '.vkvideo-comment__text { margin-top: 0.25em; white-space: pre-line; word-wrap: break-word; line-height: 1.4; }',
        '@media screen and (max-width: 767px) { .vkvideo-watch { padding: 0 0 3em; } .vkvideo-watch__buttons { margin: 0 1em 0.8em; } .vkvideo-watch__player { border-radius: 0; } .vkvideo-watch__body { padding: 0 1em; } .vkvideo-watch__title { font-size: 1.35em; } }'
    ].join('\n');

    var jsonp_seq = 0;
    var token_waiters = null;
    var card_modules = null;
    var blocked = {};
    var api_queue = [];
    var api_busy = false;
    var api_last_ts = 0;
    var resolve_cache = {};
    var progress_timer = null;
    var play_lock_until = 0;
    var player_listener_bound = false;

    var LANG = {
        vkvideo_title: {
            ru: 'VK Видео',
            uk: 'VK Відео',
            en: 'VK Video',
            be: 'VK Відэа'
        },
        vkvideo_player_mode_name: {
            ru: 'Плеер для VK Видео',
            uk: 'Плеєр для VK Відео',
            en: 'VK Video Player',
            be: 'Плэер для VK Відэа'
        },
        vkvideo_mode_direct: {
            ru: 'Плеер Lampa (из Настройки → Плеер)',
            uk: 'Плеєр Lampa (з Налаштування → Плеєр)',
            en: 'Lampa Player (from Settings → Player)',
            be: 'Плэер Lampa (з Налады → Плэер)'
        },
        vkvideo_mode_watch: {
            ru: 'Плеер VK (страница с описанием)',
            uk: 'Плеєр VK (сторінка з описом)',
            en: 'VK Player (page with description)',
            be: 'Плэер VK (старонка з апісаннем)'
        },
        vkvideo_mode_descr: {
            ru: 'Основной плеер выбирается в «Настройки → Плеер» (сейчас: {player}). Здесь переключается только запуск в плеере Lampa или в окне VK.',
            uk: 'Основний плеєр вибирається в «Налаштування → Плеєр» (зараз: {player}). Тут перемикається лише запуск у плеєрі Lampa або у вікні VK.',
            en: 'Main player is chosen in Settings → Player (current: {player}). This only switches between Lampa player and VK window.',
            be: 'Асноўны плэер выбіраецца ў «Налады → Плэер» (зараз: {player}). Тут пераключаецца толькі запуск у плэеры Lampa ці ў акне VK.'
        },
        vkvideo_player_inner: {
            ru: 'Встроенный',
            uk: 'Вбудований',
            en: 'Built-in',
            be: 'Убудаваны'
        },
        vkvideo_player_android: {
            ru: 'Android (внешний)',
            uk: 'Android (зовнішній)',
            en: 'Android (external)',
            be: 'Android (знешні)'
        },
        vkvideo_quality_name: {
            ru: 'Приоритетное качество',
            uk: 'Пріоритетна якість',
            en: 'Preferred quality',
            be: 'Прыярытэтная якасць'
        },
        vkvideo_quality_descr: {
            ru: 'Используется для нативного плеера Lampa и внешних плееров (Vimu, Just Player)',
            uk: 'Використовується для нативного плеєра Lampa та зовнішніх плеєрів (Vimu, Just Player)',
            en: 'Used for Lampa native player and external players (Vimu, Just Player)',
            be: 'Выкарыстоўваецца для натыўнага плэера Lampa і знешніх плэераў (Vimu, Just Player)'
        },
        vkvideo_quality_auto: {
            ru: 'Авто (HLS / MP4)',
            uk: 'Авто (HLS / MP4)',
            en: 'Auto (HLS / MP4)',
            be: 'Аўта (HLS / MP4)'
        },
        vkvideo_search_shelf: {
            ru: 'Поиск по VK Видео',
            uk: 'Пошук у VK Відео',
            en: 'Search VK Video',
            be: 'Пошук па VK Відэа'
        },
        vkvideo_search_card: {
            ru: 'Поиск видео',
            uk: 'Пошук відео',
            en: 'Search videos',
            be: 'Пошук відэа'
        },
        vkvideo_search_input: {
            ru: 'Поиск в VK Видео',
            uk: 'Пошук у VK Відео',
            en: 'Search in VK Video',
            be: 'Пошук у VK Відэа'
        },
        vkvideo_search_prefix: {
            ru: 'Поиск: ',
            uk: 'Пошук: ',
            en: 'Search: ',
            be: 'Пошук: '
        },
        vkvideo_recommended: {
            ru: 'Рекомендации',
            uk: 'Рекомендації',
            en: 'Recommended',
            be: 'Рэкамендацыі'
        },
        vkvideo_history: {
            ru: 'История просмотра',
            uk: 'Історія перегляду',
            en: 'Watch history',
            be: 'Гісторыя прагляду'
        },
        vkvideo_live: {
            ru: 'Эфир',
            uk: 'Ефір',
            en: 'Live',
            be: 'Эфір'
        },
        vkvideo_watched: {
            ru: 'Просмотрено',
            uk: 'Переглянуто',
            en: 'Watched',
            be: 'Прагледжана'
        },
        vkvideo_watched_done: {
            ru: '✓ Просмотрено',
            uk: '✓ Переглянуто',
            en: '✓ Watched',
            be: '✓ Прагледжана'
        },
        vkvideo_back: {
            ru: 'Назад',
            uk: 'Назад',
            en: 'Back',
            be: 'Назад'
        },
        vkvideo_play_native: {
            ru: 'Воспроизвести (Плеер)',
            uk: 'Відтворити (Плеєр)',
            en: 'Play (Player)',
            be: 'Прайграць (Плэер)'
        },
        vkvideo_show_more_desc: {
            ru: 'Показать полностью',
            uk: 'Показати повністю',
            en: 'Show more',
            be: 'Паказаць цалкам'
        },
        vkvideo_collapse_desc: {
            ru: 'Свернуть',
            uk: 'Згорнути',
            en: 'Show less',
            be: 'Згарнуць'
        },
        vkvideo_show_more: {
            ru: 'Показать ещё',
            uk: 'Показати ще',
            en: 'Load more',
            be: 'Паказаць яшчэ'
        },
        vkvideo_comments: {
            ru: 'Комментарии',
            uk: 'Коментарі',
            en: 'Comments',
            be: 'Каментарыі'
        },
        vkvideo_no_comments: {
            ru: 'Нет комментариев',
            uk: 'Немає коментарів',
            en: 'No comments',
            be: 'Няма каментарыяў'
        },
        vkvideo_comments_closed: {
            ru: 'Комментарии закрыты',
            uk: 'Коментарі закриті',
            en: 'Comments disabled',
            be: 'Каментарыі закрыты'
        },
        vkvideo_comments_error: {
            ru: 'Не удалось загрузить комментарии',
            uk: 'Не вдалося завантажити коментарі',
            en: 'Failed to load comments',
            be: 'Не ўдалося загрузіць каментарыі'
        },
        vkvideo_unavailable: {
            ru: 'Видео недоступно',
            uk: 'Відео недоступне',
            en: 'Video unavailable',
            be: 'Відэа недаступна'
        },
        vkvideo_direct_unavailable: {
            ru: 'VK Видео: прямой поток недоступен, открыт VK-плеер',
            uk: 'VK Відео: прямий потік недоступний, відкрито VK-плеєр',
            en: 'VK Video: direct stream unavailable, opening VK player',
            be: 'VK Відэа: прамы паток недаступны, адкрыты VK-плэер'
        },
        vkvideo_direct_unavailable_tv: {
            ru: 'VK Видео: прямой поток недоступен для этого видео',
            uk: 'VK Відео: прямий потік недоступний для цього відео',
            en: 'VK Video: direct stream unavailable for this video',
            be: 'VK Відэа: прамы паток недаступны для гэтага відэа'
        },
        vkvideo_no_connection: {
            ru: 'Нет связи с VK',
            uk: 'Немає зв’язку з VK',
            en: 'No connection to VK',
            be: 'Няма сувязі з VK'
        },
        vkvideo_timeout: {
            ru: 'VK не отвечает',
            uk: 'VK не відповідає',
            en: 'VK is not responding',
            be: 'VK не адказвае'
        }
    };

    function initLang() {
        if (window.Lampa && Lampa.Lang && typeof Lampa.Lang.add === 'function') {
            Lampa.Lang.add(LANG);
        }
    }

    function tr(key, fallback) {
        if (window.Lampa && Lampa.Lang && typeof Lampa.Lang.translate === 'function') {
            var translated = Lampa.Lang.translate(key);

            if (translated && translated !== key) return translated;
        }

        var lang = 'ru';

        if (window.Lampa && Lampa.Storage) {
            lang = typeof Lampa.Storage.field === 'function' ? Lampa.Storage.field('language') : Lampa.Storage.get('language', 'ru');
        }

        lang = String(lang || 'ru').toLowerCase().slice(0, 2);

        var entry = LANG[key];

        if (entry) return entry[lang] || entry.ru || fallback || key;

        return fallback || key;
    }

    function extend(target, source) {
        for (var key in source) target[key] = source[key];

        return target;
    }

    function query(params) {
        var parts = [];

        for (var key in params) {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
            }
        }

        return parts.join('&');
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function plural(n, one, few, many) {
        var mod10 = n % 10;
        var mod100 = n % 100;

        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;

        return many;
    }

    function shortNumber(n) {
        function trim(x) {
            return String(x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10).replace('.', ',');
        }

        if (n >= 1e6) return trim(n / 1e6) + ' млн';
        if (n >= 1e3) return trim(n / 1e3) + ' тыс.';

        return String(n || 0);
    }

    function countText(n, one, few, many) {
        return shortNumber(n) + ' ' + (n >= 1000 ? many : plural(n || 0, one, few, many));
    }

    function pad(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function formatDuration(sec) {
        var h = Math.floor(sec / 3600);
        var m = Math.floor(sec % 3600 / 60);

        return (h ? h + ':' + pad(m) : m) + ':' + pad(sec % 60);
    }

    function formatDate(ts) {
        return ts ? new Date(ts * 1000).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'}).replace(/\s*г\.$/, '') : '';
    }

    function ago(ts) {
        var diff = Date.now() / 1000 - ts;
        var steps = [
            [31536000, 'год', 'года', 'лет'],
            [2592000, 'месяц', 'месяца', 'месяцев'],
            [604800, 'неделю', 'недели', 'недель'],
            [86400, 'день', 'дня', 'дней'],
            [3600, 'час', 'часа', 'часов'],
            [60, 'минуту', 'минуты', 'минут']
        ];

        for (var i = 0; i < steps.length; i++) {
            var n = Math.floor(diff / steps[i][0]);

            if (n >= 1) return n + ' ' + plural(n, steps[i][1], steps[i][2], steps[i][3]) + ' назад';
        }

        return 'только что';
    }


    function jsonp(method, params, callback) {
        var name = 'vkvideo_cb_' + (++jsonp_seq);
        var script = document.createElement('script');
        var timer;
        var done = false;

        function finish(err, data) {
            if (done) return;

            done = true;
            clearTimeout(timer);
            window[name] = function () {};

            if (script.parentNode) script.parentNode.removeChild(script);

            callback(err, data);
        }

        window[name] = function (data) {
            finish(null, data);
        };

        script.charset = 'utf-8';
        script.src = API_URL + method + '?' + query(extend({
            v: API_VERSION,
            client_id: CLIENT_ID,
            lang: 'ru',
            callback: name
        }, params));

        script.onerror = function () {
            finish(new Error(tr('vkvideo_no_connection', 'Нет связи с VK')));
        };

        timer = setTimeout(function () {
            finish(new Error(tr('vkvideo_timeout', 'VK не отвечает')));
        }, TIMEOUT);

        document.head.appendChild(script);
    }

    function androidBridge() {
        var android = Lampa.Android && typeof Lampa.Android.httpReq === 'function' ? Lampa.Android : window.Android;
        return android && typeof android.httpReq === 'function' ? android : null;
    }

    function getToken(force, callback) {
        var saved = Lampa.Storage.get(TOKEN_KEY, '');
        var old = saved && saved.token ? saved.token : '';
        var left = old ? saved.expired_at * 1000 - Date.now() : 0;

        if (!force && left > 60000) {
            if (left < TOKEN_PROLONG_LEFT) requestToken(old, function () {});

            return callback(null, old);
        }

        requestToken(old, callback);
    }

    function requestToken(old, callback) {
        if (token_waiters) return token_waiters.push(callback);

        token_waiters = [callback];

        function flush(err, token) {
            var list = token_waiters;

            token_waiters = null;
            if (list) {
                list.forEach(function (fn) {
                    fn(err, token);
                });
            }
        }

        var directUrl = API_URL + 'auth.getAnonymToken?v=' + API_VERSION + '&client_id=' + CLIENT_ID + '&lang=ru';
        var fallbackUrl = 'https://lampa-vkvideo.vercel.app/api/token';

        function saveAndFlush(token, exp) {
            var expTime = exp || Math.floor(Date.now() / 1000) + 86400;

            Lampa.Storage.set(TOKEN_KEY, {token: token, expired_at: expTime});
            flush(null, token);
        }

        function parse(raw) {
            try {
                return typeof raw === 'object' ? raw : JSON.parse(raw);
            } catch (e) {
                return null;
            }
        }

        function finish() {
            if (old) return flush(null, old);
            flush(new Error('VK Video недоступен'));
        }

        function xhrStep(url, direct, next) {
            var xhr = new XMLHttpRequest();

            xhr.open('GET', url);
            xhr.timeout = 4000;
            xhr.onload = function () {
                var data = parse(xhr.responseText);

                if (direct) data = data && data.response;
                if (data && data.token) return saveAndFlush(data.token, data.expired_at);
                next();
            };
            xhr.onerror = xhr.ontimeout = function () {
                next();
            };
            xhr.send();
        }

        var android = androidBridge();

        function viaAndroid(next) {
            var fired = false;
            var timer;

            function step(data) {
                if (fired) return;
                fired = true;
                clearTimeout(timer);

                data = data && data.response;
                if (data && data.token) return saveAndFlush(data.token, data.expired_at);
                next();
            }

            timer = setTimeout(function () {
                step(null);
            }, 4500);

            try {
                android.httpReq({url: directUrl, timeout: 4000}, {
                    complite: function (res) {
                        step(parse(res));
                    },
                    error: function () {
                        step(null);
                    }
                });
            } catch (e) {
                step(null);
            }
        }

        function viaFallback(next) {
            xhrStep(fallbackUrl, false, next);
        }

        function viaDirect(next) {
            xhrStep(directUrl, true, next);
        }

        var steps = [];
        var androidWV = location.protocol === 'http:' && /Android/i.test(navigator.userAgent);

        if (android && typeof android.httpReq === 'function') steps.push(viaAndroid);
        steps.push(viaFallback);
        if (!androidWV) steps.push(viaDirect);

        (function run() {
            var s = steps.shift();

            if (!s) return finish();
            s(run);
        })();
    }

    // Проверка кодов ошибок устаревания или недействительности токена
    function isTokenError(err) {
        if (!err) return false;
        var code = err.error_code || err.code;
        var msg = (err.error_msg || err.message || '').toLowerCase();

        return code == 5 || code == 1114 || code == 1116 || code == 27 || code == 28 ||
               msg.indexOf('token') >= 0 || msg.indexOf('auth') >= 0 || msg.indexOf('expired') >= 0;
    }

    function enqueueApi(taskFn) {
        api_queue.push(taskFn);
        runApiQueue();
    }

    function runApiQueue() {
        if (api_busy || !api_queue.length) return;

        api_busy = true;

        var wait = Math.max(0, THROTTLE_MS - (Date.now() - api_last_ts));

        setTimeout(function () {
            var task = api_queue.shift();
            var released = false;

            function releaseQueue() {
                if (released) return;
                released = true;
                api_last_ts = Date.now();
                api_busy = false;
                runApiQueue();
            }

            if (!task) {
                releaseQueue();
                return;
            }

            api_last_ts = Date.now();

            try {
                task(releaseQueue);
            } catch (e) {
                releaseQueue();
            }
        }, wait);
    }

    function nativeVideoGet(android, params, callback) {
        var timer = setTimeout(function () {
            finish(new Error(tr('vkvideo_timeout', 'VK не отвечает')));
        }, TIMEOUT);

        function finish(err, data) {
            if (timer === null) return;
            clearTimeout(timer);
            timer = null;
            callback(err, data);
        }

        var url = API_URL + 'video.get?' + query(extend({v: API_VERSION, client_id: CLIENT_ID, lang: 'ru'}, params));
        try {
            android.httpReq({url: url, timeout: TIMEOUT}, {
                complite: function (data) {
                    if (typeof data === 'string') {
                        try {
                            data = JSON.parse(data);
                        } catch (e) {
                            return finish(e);
                        }
                    }
                    finish(null, data);
                },
                error: function () {
                    finish(new Error(tr('vkvideo_no_connection', 'Нет связи с VK')));
                }
            });
        } catch (e) {
            finish(e);
        }
    }

    // Вызовы VK API с автоматическим обновлением протухшего токена
    function api(method, params, callback) {
        var direct = method.indexOf('catalog.') === 0;
        var name = direct ? method : 'execute';
        var args = direct ? params : {code: 'return API.' + method + '(' + JSON.stringify(params) + ');'};

        function run(force, retried) {
            getToken(force, function (err, token) {
                if (err) return callback(err);

                enqueueApi(function (releaseQueue) {
                    var android = method === 'video.get' ? androidBridge() : null;
                    if (android) nativeVideoGet(android, extend({access_token: token}, params), done);
                    else jsonp(name, extend({access_token: token}, args), done);

                    function done(err, data) {
                        releaseQueue();

                        if (err) return callback(err);

                        if (data && data.error) {
                            if (isTokenError(data.error) && !retried) {
                                Lampa.Storage.remove(TOKEN_KEY);
                                return run(true, true);
                            }

                            var error = new Error(data.error.error_msg);

                            error.code = data.error.error_code;

                            return callback(error);
                        }

                        callback(null, data ? data.response : null);
                    }
                });
            });
        }

        run(false, false);
    }

function pickImage(list, min) {
        var best = null;

        (list || []).forEach(function (img) {
            if (!best) best = img;
            else if (best.width < min ? img.width > best.width : img.width >= min && img.width < best.width) best = img;
        });

        return best ? best.url : '';
    }

    function findOwner(id, res) {
        if (!res || typeof res !== 'object') return {name: '', photo: '', verified: false, members: 0};

        var list = (id < 0 ? res.groups : res.profiles) || [];

        for (var i = 0; i < list.length; i++) {
            var item = list[i];

            if (item.id === Math.abs(id)) {
                return {
                    name: item.name || ((item.first_name || '') + ' ' + (item.last_name || '')).trim(),
                    photo: item.photo_100 || item.photo_200 || '',
                    verified: !!item.verified,
                    members: item.members_count || 0
                };
            }
        }

        return {name: '', photo: '', verified: false, members: 0};
    }

    function getCardModules() {
        if (!card_modules && window.Lampa && Lampa.Maker) {
            card_modules = Lampa.Maker.module('Card').only('Card', 'Callback');
        }
        return card_modules;
    }

    function hasPlayableFiles(files) {
        if (!files) return false;
        if (files.hls) return true;

        for (var key in files) {
            if (key.indexOf('mp4_') === 0 && files[key]) return true;
        }

        return false;
    }

    function toCard(video, res) {
        var owner = findOwner(video.owner_id, res);
        var card = {
            id: video.owner_id + '_' + video.id,
            title: video.title,
            img: pickImage(video.image, 640),
            background: pickImage(video.image, 320),
            owner_id: video.owner_id,
            video_id: video.id,
            player: video.player,
            files: video.files,
            channel: owner.name,
            channel_photo: owner.photo,
            channel_verified: owner.verified,
            channel_members: owner.members,
            views: video.views || 0,
            likes: video.likes ? video.likes.count : 0,
            comments: video.comments || 0,
            date: video.date || 0,
            duration: video.duration || 0,
            live: video.live_status === 'started',
            description: video.description || '',
            params: {module: getCardModules()}
        };

        if (hasPlayableFiles(video.files)) {
            resolve_cache[card.id] = {
                ts: Date.now(),
                files: video.files,
                item: video,
                card: card
            };
        }

        return card;
    }

    function filterEmbeddable(videos, callback) {
        callback(videos.filter(function (video) {
            return !blocked[video.owner_id + '_' + video.id];
        }));
    }

    function extractVideoList(res) {
        if (!res || typeof res !== 'object') return [];

        var list = [];

        if (res.videos) list = list.concat(res.videos);
        if (res.items) list = list.concat(res.items);
        if (res.catalog_videos) {
            res.catalog_videos.forEach(function (cv) {
                if (cv && cv.video) list.push(cv.video);
                else if (cv && cv.id) list.push(cv);
            });
        }

        return list;
    }

    function toCards(ids, res, callback) {
        var byId = {};
        var all = extractVideoList(res);

        all.forEach(function (video) {
            byId[video.owner_id + '_' + video.id] = video;
        });

        var selected = (ids && ids.length) ? ids.map(function (id) {
            return byId[id];
        }).filter(Boolean) : all;

        filterEmbeddable(selected, function (videos) {
            callback(videos.map(function (video) {
                return toCard(video, res);
            }));
        });
    }

    function dedupe(cards, seen) {
        var out = [];

        cards.forEach(function (c) {
            if (!c || seen[c.id]) return;
            seen[c.id] = 1;
            out.push(c);
        });

        return out;
    }

    function toLine(title, cards, more) {
        return cards.length ? {title: title, results: cards, total_pages: more ? 2 : 1, more: more} : null;
    }

    function loadLines(loaders, callback) {
        var lines = [];
        var left = loaders.length;

        if (!left) return callback([]);

        loaders.forEach(function (load, i) {
            load(function (line) {
                lines[i] = line;

                if (--left === 0) callback(lines.filter(Boolean));
            });
        });
    }

    function drainLineQueue(queue, onExhausted, resolve, reject) {
        if (!queue.length) return onExhausted();

        loadLines(queue.splice(0, SHELVES_PER_BATCH), function (loaded) {
            if (loaded && loaded.length) return resolve(loaded);

            drainLineQueue(queue, onExhausted, resolve, reject);
        });
    }

    function historyCards() {
        return Lampa.Favorite.get({type: 'history'}).filter(function (card) {
            return card.source === HISTORY_SOURCE;
        });
    }

    function addHistory(video) {
        Lampa.Favorite.add('history', {id: video.owner_id !== undefined && String(video.id).indexOf('_') < 0 ? video.owner_id + '_' + (video.video_id || video.id) : video.id, source: HISTORY_SOURCE, title: video.title, img: video.img, background_image: video.background, owner_id: video.owner_id, video_id: video.video_id || video.id}, 100);

        historyCards().slice(HISTORY_SIZE).forEach(function (card) {
            Lampa.Favorite.remove('history', card);
        });
    }

    function historyLine(done) {
        var ids = historyCards().map(function (card) {
            return card.id;
        });

        if (!ids.length) return done(null);

        api('video.get', {videos: ids.join(','), extended: 1, fields: 'photo_100,members_count,verified'}, function (err, res) {
            if (err) return done(null);

            toCards(ids, res, function (cards) {
                done(toLine(tr('vkvideo_history', 'История просмотра'), cards, {history: true}));
            });
        });
    }

    function searchLine(done) {
        var searchCard = {
            id: 'vkvideo_search_trigger',
            is_search: true,
            title: tr('vkvideo_search_card', 'Поиск видео'),
            img: '',
            background: '',
            params: {module: getCardModules()}
        };

        done({
            title: tr('vkvideo_search_shelf', 'Поиск по VK Видео'),
            results: [searchCard],
            total_pages: 1
        });
    }

    function sectionLine(section) {
        return function (done) {
            api('catalog.getSection', {section_id: section.id}, function (err, res) {
                var sec = !err && res && res.section;
                var block = sec && sec.blocks && sec.blocks[0];

                if (!block || !block.videos_ids) return done(null);

                toCards(block.videos_ids, res, function (cards) {
                    done(toLine(section.title, cards, section && section.id ? {section_id: section.id} : null));
                });
            });
        };
    }

    function showcaseSection(res) {
        if (!res || typeof res !== 'object') return null;

        if (res.section) return res.section;

        return ((res.catalog && res.catalog.sections) || []).filter(function (section) {
            return section.blocks && section.blocks.length;
        })[0] || null;
    }

    function showcaseShelves(section) {
        var shelves = [];
        var prev = null;

        (section.blocks || []).forEach(function (block) {
            var head = prev && prev.layout && prev.layout.name === 'header' ? prev : null;
            var more = (block.actions || []).concat(head && head.actions || []).filter(function (item) {
                return item.action && item.action.url;
            })[0];

            prev = block;

            if (block.data_type !== 'videos' || !block.videos_ids || !block.videos_ids.length) return;

            shelves.push({
                title: block.title || (head && head.layout.title) || '',
                ids: block.videos_ids,
                url: more ? more.action.url : ''
            });
        });

        return shelves;
    }

    function mixShelves(shelves) {
        var ids = [];

        for (var i = 0; ids.length < SHELF_SIZE; i++) {
            var found = false;

            shelves.forEach(function (shelf) {
                var id = shelf.ids[i];

                if (!id) return;

                found = true;

                if (ids.length < SHELF_SIZE && ids.indexOf(id) < 0) ids.push(id);
            });

            if (!found) break;
        }

        return ids;
    }

    function showcaseLine(showcase) {
        return function (done) {
            api('catalog.getVideoShowcase', {url: showcase.url, need_blocks: 1}, function (err, res) {
                var section = !err && showcaseSection(res);
                var shelves = section ? showcaseShelves(section) : [];

                if (!shelves.length) return done(null);

                var more = shelves.length > 1 ? {showcase_url: showcase.url} : shelves[0].url ? {section_url: shelves[0].url} : (section && section.id) ? {section_id: section.id, section_url: showcase.url} : {section_url: showcase.url};

                toCards(mixShelves(shelves), res, function (cards) {
                    done(toLine(showcase.title, cards, more));
                });
            });
        };
    }

    function notify(err) {
        if (window.Lampa && Lampa.Noty) {
            Lampa.Noty.show(tr('vkvideo_title', MENU_TITLE) + ': ' + (err.message || err));
        }
    }

    function startSearch() {
        if (!window.Lampa || !Lampa.Input) return;

        Lampa.Input.edit({
            title: tr('vkvideo_search_input', 'Поиск в VK Видео'),
            value: '',
            free: true
        }, function (value) {
            if (value && value.trim()) {
                Lampa.Activity.push({
                    component: 'vkvideo_search',
                    title: tr('vkvideo_search_prefix', 'Поиск: ') + value.trim(),
                    query: value.trim(),
                    url: '',
                    page: 1
                });
            }
        });
    }

    var MP4_ORDER = [2160, 1440, 1080, 720, 480, 360, 240, 144];

    // Лучший MP4 не выше maxQ (или ближайший доступный); maxQ=0 -> самый высокий
    function pickMp4(files, maxQ) {
        var i, q;

        for (i = 0; i < MP4_ORDER.length; i++) {
            q = MP4_ORDER[i];
            if ((!maxQ || q <= maxQ) && files['mp4_' + q]) return files['mp4_' + q];
        }

        for (i = MP4_ORDER.length - 1; i >= 0; i--) {
            if (files['mp4_' + MP4_ORDER[i]]) return files['mp4_' + MP4_ORDER[i]];
        }

        return '';
    }

    function getStreamUrl(files, quality, preferMp4) {
        if (!files) return '';

        var normQuality = String(quality || 'auto').replace(/^q/, '');
        var num = parseInt(normQuality, 10);

        if (num > 0) {
            var exact = pickMp4(files, num);

            if (exact) return exact;
        } else if (preferMp4) {
            var best = pickMp4(files, 0);

            if (best) return best;
        }

        return files.hls || files.mp4_2160 || files.mp4_1440 || files.mp4_1080 || files.mp4_720 || files.mp4_480 || files.mp4_360 || files.mp4_240 || files.mp4_144 || '';
    }

    function buildQualityData(files, prefQuality, preferMp4) {
        var qualityMap = {};
        var candidates = [];

        if (!files) return {url: '', qualityMap: qualityMap, reserveUrl: ''};

        if (files.hls) {
            qualityMap['Авто (HLS)'] = files.hls;
            candidates.push(files.hls);
        }

        var resolutions = [
            ['mp4_2160', '2160p'],
            ['mp4_1440', '1440p'],
            ['mp4_1080', '1080p'],
            ['mp4_720', '720p'],
            ['mp4_480', '480p'],
            ['mp4_360', '360p'],
            ['mp4_240', '240p'],
            ['mp4_144', '144p']
        ];

        resolutions.forEach(function (item) {
            var url = files[item[0]];

            if (url) {
                qualityMap[item[1]] = url;
                candidates.push(url);
            }
        });

        var normQuality = String(prefQuality || 'auto').replace(/^q/, '');
        var primaryUrl = getStreamUrl(files, normQuality, preferMp4);
        var reserveUrl = '';

        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] && candidates[i] !== primaryUrl) {
                reserveUrl = candidates[i];
                break;
            }
        }

        return {
            url: primaryUrl,
            qualityMap: qualityMap,
            reserveUrl: reserveUrl
        };
    }

    function getVideoKey(video) {
        if (!video) return '';

        var vid = video.video_id || video.id;

        if (video.owner_id !== undefined && vid !== undefined && String(vid).indexOf('_') < 0) {
            return video.owner_id + '_' + vid;
        }

        return vid ? String(vid) : '';
    }

    function resolveVideoFiles(video, callback) {
        var key = getVideoKey(video);

        if (hasPlayableFiles(video && video.files)) {
            if (key && (!resolve_cache[key] || Date.now() - resolve_cache[key].ts >= RESOLVE_TTL)) {
                resolve_cache[key] = {
                    ts: Date.now(),
                    files: video.files,
                    item: video,
                    card: video.channel !== undefined ? video : null
                };
            }

            return callback(null, video.files, video);
        }

        var cached = key ? resolve_cache[key] : null;

        if (cached && (Date.now() - cached.ts < RESOLVE_TTL) && hasPlayableFiles(cached.files)) {
            return callback(null, cached.files, cached.card || cached.item || video);
        }

        if (!key) return callback(new Error('Неверный идентификатор видео'));

        api('video.get', {videos: key, extended: 1, fields: 'photo_100,members_count,verified'}, function (err, res) {
            if (err) return callback(err);

            var item = res && res.items && res.items[0];

            if (!item || !hasPlayableFiles(item.files)) {
                return callback(new Error('Прямой поток недоступен'));
            }

            var card = toCard(item, res);

            resolve_cache[key] = {
                ts: Date.now(),
                files: item.files,
                item: item,
                card: card
            };

            callback(null, item.files, card);
        });
    }

    function getProgressMap() {
        var map = Lampa.Storage.get(PROGRESS_KEY, {});

        return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
    }

    function getSavedProgress(video) {
        var key = getVideoKey(video);

        if (!key) return null;

        var map = getProgressMap();

        return map[key] || null;
    }

    function saveProgress(key, timeSec, durationSec) {
        if (!key || !durationSec || durationSec <= 0 || !isFinite(durationSec) || !isFinite(timeSec) || timeSec < 0) return;

        var map = getProgressMap();
        var time = Math.floor(timeSec);
        var duration = Math.floor(durationSec);
        var percent = Math.min(100, Math.max(0, Math.round((timeSec / durationSec) * 100)));

        map[key] = {
            time: time,
            duration: duration,
            percent: percent,
            ts: Date.now()
        };

        var keys = Object.keys(map);

        if (keys.length > 200) {
            keys.sort(function (a, b) {
                return (map[b].ts || 0) - (map[a].ts || 0);
            });

            var trimmed = {};

            for (var i = 0; i < 200; i++) {
                trimmed[keys[i]] = map[keys[i]];
            }

            map = trimmed;
        }

        Lampa.Storage.set(PROGRESS_KEY, map);
    }

    function getResumeTime(video) {
        if (!video || video.live) return 0;

        var prog = getSavedProgress(video);

        if (!prog || !prog.time || !prog.duration) return 0;

        var ratio = prog.time / prog.duration;

        if (ratio >= 0.03 && ratio < 0.95) return prog.time;

        return 0;
    }

    var progress_ctx = null;

    function flushProgress() {
        var ctx = progress_ctx;

        if (!ctx || !ctx.el) return;

        try {
            var cur = ctx.el.currentTime;
            var dur = (ctx.el.duration && isFinite(ctx.el.duration)) ? ctx.el.duration : (ctx.video.duration || 0);

            if (cur > 0 && dur > 0) saveProgress(ctx.key, cur, dur);
        } catch (e) {}
    }

    function onPlayerDestroy() {
        flushProgress();
        stopProgressMonitor();
        progress_ctx = null;
        play_lock_until = 0;
    }

    function stopProgressMonitor() {
        if (progress_timer) {
            clearInterval(progress_timer);
            progress_timer = null;
        }
    }

    function bindPlayerLifecycle() {
        if (player_listener_bound) return;

        if (window.Lampa && Lampa.Player && Lampa.Player.listener && Lampa.Player.listener.follow) {
            Lampa.Player.listener.follow('destroy', onPlayerDestroy);
            player_listener_bound = true;
        }
    }

    function isPrerollVideo(el, video) {
        if (!el) return true;
        if (video && video.duration > 30 && el.duration && isFinite(el.duration) && el.duration < 25) return true;
        return false;
    }

    function startProgressMonitor(video, resumeSec) {
        stopProgressMonitor();
        bindPlayerLifecycle();

        if (!video || video.live) return;

        var key = getVideoKey(video);

        if (!key) return;

        progress_ctx = {key: key, video: video, el: null};

        var seekDone = !(resumeSec > 0);
        var boundEl = null;

        function trySeek(el) {
            if (seekDone || !el) return;

            function doSeek() {
                if (seekDone) return;
                seekDone = true;
                try {
                    if (el.currentTime < 2) el.currentTime = resumeSec;
                } catch (e) {}
            }

            if (el.readyState >= 1) {
                doSeek();
            } else if (boundEl !== el) {
                boundEl = el;

                var onMeta = function () {
                    el.removeEventListener('loadedmetadata', onMeta);
                    doSeek();
                };

                el.addEventListener('loadedmetadata', onMeta);
            }
        }

        var startedAt = Date.now();
        var everPlayed = false;

        progress_timer = setInterval(function () {
            var videoEl = document.querySelector('video');
            var opened = window.Lampa && Lampa.Player && typeof Lampa.Player.opened === 'function' ? Lampa.Player.opened() : false;

            if (!opened && !videoEl) {
                if (everPlayed || Date.now() - startedAt > 20000) stopProgressMonitor();
                return;
            }

            if (videoEl && videoEl.readyState >= 1 && !isPrerollVideo(videoEl, video)) {
                if (progress_ctx) progress_ctx.el = videoEl;
                trySeek(videoEl);

                var cur = videoEl.currentTime;
                var dur = (videoEl.duration && isFinite(videoEl.duration)) ? videoEl.duration : (video.duration || 0);

                if (cur > 0 && dur > 0) {
                    everPlayed = true;
                    saveProgress(key, cur, dur);
                }
            }
        }, 2500);
    }

    function getLampaPlayer() {
        return (window.Lampa && Lampa.Storage && typeof Lampa.Storage.field === 'function') ? String(Lampa.Storage.field('player') || 'inner') : String(Lampa.Storage.get('player', 'inner') || 'inner');
    }

    function isTvOrAndroid() {
        if (window.Android) return true;
        if (window.Lampa && Lampa.Platform) {
            if (typeof Lampa.Platform.tv === 'function' && Lampa.Platform.tv()) return true;
            if (typeof Lampa.Platform.is === 'function' && (
                Lampa.Platform.is('android') || Lampa.Platform.is('tizen') ||
                Lampa.Platform.is('webos') || Lampa.Platform.is('orsay') ||
                Lampa.Platform.is('netcast') || Lampa.Platform.is('apple_tv')
            )) return true;
        }
        return /Android|SmartTV|SMART-TV|Tizen|Web0S/i.test(navigator.userAgent || '');
    }

    function playDirect(video) {
        if (Date.now() < play_lock_until) return;
        play_lock_until = Date.now() + 5000;

        var quality = String(Lampa.Storage.get('vkvideo_quality', 'auto') || 'auto').replace(/^q/, '');
        var vid = video.video_id || video.id;

        resolveVideoFiles(video, function (err, files, resolvedVideo) {
            var target = resolvedVideo || video;
            var lampaPlayer = getLampaPlayer();
            var preferMp4 = !target.live && !video.live && lampaPlayer === 'inner';
            var qData = files ? buildQualityData(files, quality, preferMp4) : {};

            if (qData.url && window.Lampa && Lampa.Player) {
                addHistory(target);

                var resumeSec = getResumeTime(target);
                var dur = target.duration || video.duration || 0;
                var playData = {
                    url: qData.url,
                    title: target.title || video.title
                };

                if (qData.qualityMap && Object.keys(qData.qualityMap).length > 1) {
                    playData.quality = qData.qualityMap;
                }

                if (qData.reserveUrl) {
                    playData.url_reserve = qData.reserveUrl;
                }

                if (resumeSec > 0) {
                    playData.timeline = {
                        time: resumeSec,
                        duration: dur,
                        percent: Math.round((resumeSec / (dur || 1)) * 100)
                    };
                }

                console.log('[VKVideo] playDirect lampa_player=' + lampaPlayer + ' preferMp4=' + preferMp4 + ' quality=' + quality + ' urlType=' + (/\.m3u8/i.test(qData.url) ? 'hls' : 'mp4') + ' reserve=' + (qData.reserveUrl ? (/\.m3u8/i.test(qData.reserveUrl) ? 'hls' : 'mp4') : 'none'));

                Lampa.Player.play(playData);

                if (lampaPlayer === 'inner') {
                    startProgressMonitor(target, resumeSec);
                } else {
                    stopProgressMonitor();
                }
            } else {
                play_lock_until = 0;

                if (isTvOrAndroid()) {
                    if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(tr('vkvideo_direct_unavailable_tv', 'VK Видео: прямой поток недоступен для этого видео'));
                    return;
                }

                if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(tr('vkvideo_direct_unavailable', 'VK Видео: прямой поток недоступен, открыт VK-плеер'));

                Lampa.Activity.push({component: 'vkvideo_video', title: video.title, oid: video.owner_id, vid: vid, video: (target && (target.player || hasPlayableFiles(target.files))) ? target : null, url: '', page: 1});
            }
        });
    }

    function openVideo(video) {
        var mode = Lampa.Storage.get('vkvideo_player_mode', 'direct');

        console.log('[VKVideo] openVideo mode=' + mode + ' lampa_player=' + getLampaPlayer() + ' quality=' + Lampa.Storage.get('vkvideo_quality', 'auto') + ' id=' + getVideoKey(video));

        if (mode === 'direct') {
            playDirect(video);
        } else {
            Lampa.Activity.push({component: 'vkvideo_video', title: video.title, oid: video.owner_id, vid: video.video_id || video.id, video: video, url: '', page: 1});
        }
    }

function openMore(more, title) {
        if (more.history) return Lampa.Router.call('favorite', {type: 'history', title: Lampa.Lang.translate('title_history')});

        if (more.showcase_url) return Lampa.Activity.push({component: 'vkvideo_showcase', title: title, showcase_url: more.showcase_url, url: '', page: 1});

        Lampa.Activity.push({component: 'vkvideo_section', title: title, section_id: more.section_id, section_url: more.section_url, url: '', page: 1});
    }

    function openCatalog() {
        Lampa.Activity.push({component: 'vkvideo_main', title: tr('vkvideo_title', MENU_TITLE), url: '', page: 1});
    }

    var CardView = {
        onCreate: function () {
            var data = this.data;
            var view = this.html.querySelector('.card__view');
            var meta = this.html.querySelector('.card__age');

            this.html.classList.add('card--vkvideo');

            if (view) {
                if (data.live || data.duration) {
                    var badge = document.createElement('div');

                    badge.className = 'card__vkvideo-badge' + (data.live ? ' card__vkvideo-badge--live' : '');
                    badge.textContent = data.live ? tr('vkvideo_live', 'Эфир') : formatDuration(data.duration);
                    view.appendChild(badge);
                }

                if (!data.live) {
                    var prog = getSavedProgress(data);

                    if (prog && prog.percent >= 3) {
                        var progBadge = document.createElement('div');
                        var done = prog.percent >= 95;

                        progBadge.className = 'card__vkvideo-progress' + (done ? ' card__vkvideo-progress--done' : '');
                        progBadge.textContent = done ? tr('vkvideo_watched_done', '✓ Просмотрено') : (tr('vkvideo_watched', 'Просмотрено') + ' ' + prog.percent + '%');
                        view.appendChild(progBadge);
                    }
                }
            }

            if (!meta) {
                meta = document.createElement('div');
                meta.className = 'card__age';
                this.html.appendChild(meta);
            }

            meta.textContent = [data.channel, countText(data.views, 'просмотр', 'просмотра', 'просмотров')].filter(Boolean).join(' · ');
        }
    };

    function setupCard(card, video) {
        if (video.is_search) {
            card.use({
                onCreate: function () {
                    this.html.classList.add('card--vkvideo', 'card--vkvideo-search');
                    var view = this.html.querySelector('.card__view');
                    if (view) {
                        view.innerHTML = ICON_SEARCH;
                    }
                },
                onEnter: function () {
                    startSearch();
                }
            });
            return;
        }

        card.use(CardView);
        card.use({
            onEnter: function () {
                openVideo(video);
            },
            onFocus: function () {
                Lampa.Background.change(video.background);
            }
        });
    }

    function setupLine(line) {
        line.use({
            onMore: function (data) {
                openMore(data.more, data.title);
            },
            onInstance: setupCard
        });
    }

    function CatalogPage(object) {
        var queue = [];
        var comp = Lampa.Maker.make('Main', object);

        comp.use({
            onCreate: function () {
                var self = this;

                api('catalog.getVideo', {url: CATALOG_URL, need_blocks: 1}, function (err, res) {
                    if (err || !res) {
                        if (err) notify(err);

                        return self.empty();
                    }

                    var all = (res && res.catalog && res.catalog.sections) || [];
                    var block = all[0] && all[0].blocks && all[0].blocks[0];

                    function recommended(done) {
                        if (!block || !block.videos_ids) return done(null);

                        toCards(block.videos_ids, res, function (cards) {
                            done(toLine(tr('vkvideo_recommended', 'Рекомендации'), cards, {section_id: all[0].id}));
                        });
                    }

                    queue = SHOWCASES.map(showcaseLine).concat(all.slice(1).map(sectionLine));

                    loadLines([searchLine, historyLine, recommended].concat(queue.splice(0, 2)), function (lines) {
                        if (lines.length) self.build(lines);
                        else self.empty();
                    });
                });
            },
            onNext: function (resolve, reject) {
                drainLineQueue(queue, reject, resolve, reject);
            },
            onInstance: setupLine
        });

        return comp;
    }

    function ShowcasePage(object) {
        var section = null;
        var queue = [];
        var comp = Lampa.Maker.make('Main', object);

        function lines(res, callback) {
            section = showcaseSection(res);

            var shelves = section ? showcaseShelves(section) : [];

            function shelfMore(shelf) {
                return shelf.url ? {section_url: shelf.url} : (section && section.id ? {section_id: section.id} : null);
            }

            queue = shelves.slice(1).map(function (shelf) {
                return function (done) {
                    toCards(shelf.ids, res, function (cards) {
                        done(toLine(shelf.title, cards, shelfMore(shelf)));
                    });
                };
            });

            if (!shelves.length) return callback([]);

            toCards(shelves[0].ids, res, function (cards) {
                loadLines([function (done) {
                    done(toLine(shelves[0].title, cards, shelfMore(shelves[0])));
                }].concat(queue.splice(0, 2)), callback);
            });
        }

        function nextBatch(resolve, reject) {
            drainLineQueue(queue, function () {
                var from = section && section.next_from;

                if (!from) return reject();

                section.next_from = null;

                api('catalog.getSection', {section_id: section.id, start_from: from, need_blocks: 1, extended: 1}, function (err, res) {
                    if (err || !res || !res.section) return reject();

                    if (res.section.next_from === from) res.section.next_from = null;
                    section = res.section;
                    lines(res, function (loaded) {
                        if (loaded && loaded.length) return resolve(loaded);

                        nextBatch(resolve, reject);
                    });
                });
            }, resolve, reject);
        }

        comp.use({
            onCreate: function () {
                var self = this;

                api('catalog.getVideoShowcase', {url: object.showcase_url, need_blocks: 1}, function (err, res) {
                    if (err || !res) {
                        if (err) notify(err);

                        return self.empty();
                    }

                    lines(res, function (lines) {
                        if (lines.length) self.build(lines);
                        else self.empty();
                    });
                });
            },
            onNext: function (resolve, reject) {
                nextBatch(resolve, reject);
            },
            onInstance: setupLine
        });

        return comp;
    }

    function SectionPage(object) {
        var section_id = object.section_id;
        var cursor = null;
        var currentPage = object.page || 1;
        var loading = false;
        var MAX_EMPTY_HOPS = 5;
        var seenIds = {};
        var seenCursors = {};

        object.params = {items: {cols: 4}};

        var comp = Lampa.Maker.make('Category', object, function (mod) {
            return mod.toggle(mod.MASK.base, 'Pagination');
        });

        // Динамическая подгрузка порций (без искусственных ограничений)
        function loadChunk(done, fail, emptyHops) {
            emptyHops = emptyHops || 0;

            if (!section_id && !object.section_url) return fail();

            var method = section_id ? 'catalog.getSection' : 'catalog.getVideoShowcase';
            var params = section_id ?
                (cursor ? {section_id: section_id, start_from: cursor, extended: 1, need_blocks: 1} : {section_id: section_id, extended: 1, need_blocks: 1}) :
                {url: object.section_url, need_blocks: 1};

            loading = true;

            api(method, params, function (err, res) {
                if (err || !res) {
                    if (currentPage === 1 && err && err.code != 15) notify(err);
                    cursor = null;
                    loading = false;
                    return fail();
                }

                var section = showcaseSection(res);

                if (section && section.id) section_id = section.id;

                var allBlocks = (section && Array.isArray(section.blocks)) ? section.blocks : [];
                var cursorBlock = allBlocks.filter(function (b) { return b && b.next_from; })[0];
                var blocks = allBlocks.filter(function (block) {
                    return block && ((block.data_type === 'videos' && block.videos_ids && block.videos_ids.length) ||
                           (block.data_type === 'catalog_videos') ||
                           (block.videos_ids && block.videos_ids.length));
                });

                var nextCursor = (blocks[0] && blocks[0].next_from) || (cursorBlock && cursorBlock.next_from) || (section && section.next_from) || null;

                if (nextCursor && (nextCursor === cursor || seenCursors[nextCursor])) nextCursor = null;
                if (nextCursor) seenCursors[nextCursor] = 1;
                cursor = nextCursor;

                var ids = [];
                blocks.forEach(function (block) {
                    if (block.videos_ids) ids = ids.concat(block.videos_ids);
                });

                toCards(ids.length ? ids : null, res, function (chunkCards) {
                    chunkCards = dedupe(chunkCards || [], seenIds);

                    if (!chunkCards || !chunkCards.length) {
                        if (cursor && emptyHops < MAX_EMPTY_HOPS) {
                            return loadChunk(done, fail, emptyHops + 1);
                        }

                        cursor = null;
                        loading = false;
                        return fail();
                    }

                    loading = false;
                    var pageNum = currentPage++;

                    done({
                        results: chunkCards,
                        page: pageNum,
                        total_pages: cursor ? 1000 : pageNum
                    });
                });
            });
        }

        comp.use({
            onCreate: function () {
                var self = this;

                loadChunk(function (data) {
                    self.build(data);
                }, function () {
                    self.empty();
                });
            },
            onNext: function (resolve, reject) {
                if (!cursor || loading) {
                    if (reject) reject();
                    return;
                }

                loadChunk(resolve, function () {
                    cursor = null;
                    loading = false;
                    if (reject) reject();
                });
            },
            onInstance: setupCard
        });

        return comp;
    }

    function SearchPage(object) {
        var queryStr = (object.query || '').trim();
        var section_id = null;
        var cursor = null;
        var currentPage = object.page || 1;
        var loading = false;
        var MAX_EMPTY_HOPS = 5;
        var seenIds = {};
        var seenCursors = {};

        object.params = {items: {cols: 4}};

        var comp = Lampa.Maker.make('Category', object, function (mod) {
            return mod.toggle(mod.MASK.base, 'Pagination');
        });

        function loadSearchChunk(done, fail, emptyHops) {
            emptyHops = emptyHops || 0;

            if (!queryStr) return fail();

            loading = true;

            if (!section_id) {
                // В VK API параметр поискового запроса называется "q", а не "query"
                api('catalog.getVideoSearch', {q: queryStr, need_blocks: 1}, function (err, res) {
                    if (err || !res || !res.catalog || !res.catalog.sections || !res.catalog.sections.length) {
                        if (currentPage === 1 && err && err.code != 15) notify(err);
                        cursor = null;
                        loading = false;
                        return fail();
                    }

                    var firstSec = res.catalog.sections[0];
                    section_id = firstSec.id;

                    var nextCursor = firstSec.next_from || (firstSec.blocks && firstSec.blocks[0] && firstSec.blocks[0].next_from) || null;

                    if (nextCursor && (nextCursor === cursor || seenCursors[nextCursor])) nextCursor = null;
                if (nextCursor) seenCursors[nextCursor] = 1;
                    cursor = nextCursor;

                    toCards(null, res, function (chunkCards) {
                    chunkCards = dedupe(chunkCards || [], seenIds);

                        if (!chunkCards || !chunkCards.length) {
                            if (cursor && emptyHops < MAX_EMPTY_HOPS) {
                                return loadSearchChunk(done, fail, emptyHops + 1);
                            }

                            cursor = null;
                            loading = false;
                            return fail();
                        }

                        loading = false;
                        var pageNum = currentPage++;

                        done({
                            results: chunkCards,
                            page: pageNum,
                            total_pages: cursor ? 1000 : pageNum
                        });
                    });
                });
            } else {
                if (!cursor) {
                    loading = false;
                    return fail();
                }

                var params = {section_id: section_id, start_from: cursor, extended: 1, need_blocks: 1};

                api('catalog.getSection', params, function (sErr, sRes) {
                    if (sErr || !sRes) {
                        if (currentPage === 1 && sErr && sErr.code != 15) notify(sErr);
                        cursor = null;
                        loading = false;
                        return fail();
                    }

                    var section = showcaseSection(sRes);
                    var allBlocks = (section && Array.isArray(section.blocks)) ? section.blocks : [];
                    var cursorBlock = allBlocks.filter(function (b) { return b && b.next_from; })[0];
                    var blocks = allBlocks.filter(function (b) {
                        return b && ((b.data_type === 'videos' && b.videos_ids && b.videos_ids.length) ||
                               b.data_type === 'catalog_videos' ||
                               (b.videos_ids && b.videos_ids.length));
                    });

                    var nextCursor = (section && section.next_from) || (blocks[0] && blocks[0].next_from) || (cursorBlock && cursorBlock.next_from) || null;

                    if (nextCursor && (nextCursor === cursor || seenCursors[nextCursor])) nextCursor = null;
                if (nextCursor) seenCursors[nextCursor] = 1;
                    cursor = nextCursor;

                    toCards(null, sRes, function (chunkCards) {
                    chunkCards = dedupe(chunkCards || [], seenIds);

                        if (!chunkCards || !chunkCards.length) {
                            if (cursor && emptyHops < MAX_EMPTY_HOPS) {
                                return loadSearchChunk(done, fail, emptyHops + 1);
                            }

                            cursor = null;
                            loading = false;
                            return fail();
                        }

                        loading = false;
                        var pageNum = currentPage++;

                        done({
                            results: chunkCards,
                            page: pageNum,
                            total_pages: cursor ? 1000 : pageNum
                        });
                    });
                });
            }
        }

        comp.use({
            onCreate: function () {
                var self = this;

                loadSearchChunk(function (data) {
                    self.build(data);
                }, function () {
                    self.empty();
                });
            },
            onNext: function (resolve, reject) {
                if (!cursor || loading) {
                    if (reject) reject();
                    return;
                }

                loadSearchChunk(resolve, function () {
                    cursor = null;
                    loading = false;
                    if (reject) reject();
                });
            },
            onInstance: setupCard
        });

        return comp;
    }

    function cleanText(text) {
        // Упоминания VK вида [id1|Имя] показываем как имя
        return String(text || '').replace(/\[(?:id|club|public)\d+\|([^\]]+)\]/g, '$1');
    }

    function avatar(className, url) {
        return '<div class="' + className + '"' + (url ? ' style="background-image: url(\'' + esc(url) + '\')"' : '') + '></div>';
    }

    function WatchPage(object) {
        this.object = object;
        this.video = object.video;
        this.scroll = new Lampa.Scroll({mask: true, over: true, step: 250});
        this.html = document.createElement('div');
        this.comments_offset = 0;
        this.comments_total = 0;
    }

    WatchPage.prototype.create = function () {
        this.scroll.minus();
        this.html.appendChild(this.scroll.render(true));

        if (this.video && (this.video.player || hasPlayableFiles(this.video.files))) this.build();
        else this.restore();
    };

    WatchPage.prototype.restore = function () {
        var self = this;
        var object = this.object;
        var key = object.oid + '_' + object.vid;
        var cached = resolve_cache[key];

        if (cached && (Date.now() - cached.ts < RESOLVE_TTL) && (cached.card || (cached.item && cached.item.title))) {
            this.video = object.video = cached.card || toCard(cached.item, {});
            this.build();
            return;
        }

        this.activity.loader(true);

        api('video.get', {videos: key, extended: 1, fields: 'photo_100,members_count,verified'}, function (err, res) {
            var video = !err && res && res.items && res.items[0];

            if (self.destroyed) return;

            self.activity.loader(false);

            if (video) {
                self.video = object.video = toCard(video, res);
                self.build();
            }
            else {
                self.scroll.append($('<div class="vkvideo-watch"><div class="vkvideo-watch__note">' + esc(tr('vkvideo_unavailable', 'Видео недоступно')) + '</div></div>'));
            }

            self.activity.toggle();
        });
    };

    WatchPage.prototype.build = function () {
        var self = this;
        var video = this.video;
        var stats = [countText(video.views, 'просмотр', 'просмотра', 'просмотров'), formatDate(video.date)].filter(Boolean).join(' · ');
        var sub = video.channel_members ? countText(video.channel_members, 'подписчик', 'подписчика', 'подписчиков') : '';
        var desc = video.description || '';
        var long = desc.length > 200 || desc.split('\n').length > 3;

        var hasDirectStream = hasPlayableFiles(video.files);

        this.body = document.createElement('div');
        this.body.className = 'vkvideo-watch';
        this.body.innerHTML = [
            '<div class="vkvideo-watch__inner">',
            '<div class="vkvideo-watch__buttons">',
            '<div class="simple-button simple-button--inline selector vkvideo-watch__back"><svg><use xlink:href="#sprite-backward"></use></svg><span>' + esc(tr('vkvideo_back', 'Назад')) + '</span></div>',
            hasDirectStream ? '<div class="simple-button simple-button--inline selector vkvideo-watch__native">' + ICON_PLAY + '<span>' + esc(tr('vkvideo_play_native', 'Воспроизвести (Плеер)')) + '</span></div>' : '',
            '</div>',
            '<div class="vkvideo-watch__player selector"></div>',
            '<div class="vkvideo-watch__body">',
            '<div class="vkvideo-watch__title">' + esc(video.title) + '</div>',
            '<div class="vkvideo-watch__stats">' + esc(stats) + (video.likes ? ' · <span class="vkvideo-watch__likes">' + ICON_LIKE + ' ' + esc(shortNumber(video.likes)) + '</span>' : '') + '</div>',
            video.channel ? '<div class="vkvideo-watch__channel">' + avatar('vkvideo-watch__avatar', video.channel_photo) +
                '<div><div class="vkvideo-watch__channel-name">' + esc(video.channel) + (video.channel_verified ? '<span class="vkvideo-watch__verified">' + ICON_VERIFIED + '</span>' : '') + '</div>' +
                (sub ? '<div class="vkvideo-watch__channel-sub">' + esc(sub) + '</div>' : '') + '</div></div>' : '',
            desc ? '<div class="vkvideo-watch__desc' + (long ? ' selector' : ' expanded') + '"><div class="vkvideo-watch__desc-text">' + esc(cleanText(desc)) + '</div>' +
                (long ? '<div class="vkvideo-watch__desc-toggle">' + esc(tr('vkvideo_show_more_desc', 'Показать полностью')) + '</div>' : '') + '</div>' : '',
            '<div class="vkvideo-watch__comments-head">' + esc(tr('vkvideo_comments', 'Комментарии')) + '</div>',
            '<div class="vkvideo-watch__comments"></div>',
            '<div class="simple-button selector vkvideo-watch__more hide"><span>' + esc(tr('vkvideo_show_more', 'Показать ещё')) + '</span></div>',
            '</div>',
            '</div>'
        ].join('');

        this.head = this.body.querySelector('.vkvideo-watch__comments-head');
        this.list = this.body.querySelector('.vkvideo-watch__comments');
        this.more = this.body.querySelector('.vkvideo-watch__more');

        if (video.player) {
            this.frame = document.createElement('iframe');
            this.frame.src = video.player + (video.player.indexOf('?') < 0 ? '?' : '&') + EMBED_PARAMS;
            this.frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
            this.body.querySelector('.vkvideo-watch__player').appendChild(this.frame);
        }

        this.onMessage = function (e) {
            if (e.origin !== PLAYER_ORIGIN || !self.frame || e.source !== self.frame.contentWindow) return;

            var data = e.data;

            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                }
                catch (err) {
                    return;
                }
            }

            if (!data) return;

            if (data.state) self.state = data.state;

            if (data.event === 'inited' && !self.autoplayed) {
                self.autoplayed = true;
                self.command('play');
            }

            if (data.event === 'started' && !self.reported) {
                self.reported = true;
                api('video.viewStarted', {owner_id: video.owner_id, video_id: video.video_id}, function () {});
            }

            if (data.event === 'error') blocked[video.id] = true;
        };

        window.addEventListener('message', this.onMessage);

        $(this.body.querySelector('.vkvideo-watch__back')).on('hover:enter', function () {
            Lampa.Activity.backward();
        });

        if (hasDirectStream) {
            $(this.body.querySelector('.vkvideo-watch__native')).on('hover:enter', function () {
                if (self.frame) {
                    try { self.command('pause'); } catch (e) {}
                    try { self.command('mute'); } catch (e) {}
                    self.frame.src = 'about:blank';
                }
                self.state = 'paused';
                playDirect(video);
            });
        }

        this.last = this.body.querySelector('.vkvideo-watch__native') || this.body.querySelector('.vkvideo-watch__back');

        $(this.body.querySelector('.vkvideo-watch__desc.selector')).on('hover:enter', function () {
            $(this).toggleClass('expanded');
            $(this).find('.vkvideo-watch__desc-toggle').text($(this).hasClass('expanded') ? tr('vkvideo_collapse_desc', 'Свернуть') : tr('vkvideo_show_more_desc', 'Показать полностью'));
        });

        $(this.more).on('hover:enter', function () {
            self.loadComments();
        });

        this.bindFocus(this.body.querySelectorAll('.selector'));
        this.scroll.append(this.body);

        Lampa.Background.change(video.background);

        addHistory(video);
        this.loadComments();
    };

    WatchPage.prototype.command = function (method) {
        if (this.frame && this.frame.contentWindow) this.frame.contentWindow.postMessage({method: method}, PLAYER_ORIGIN);
    };

    WatchPage.prototype.bindFocus = function (nodes) {
        var self = this;

        $(nodes).on('hover:focus', function () {
            self.last = this;

            if (this.classList.contains('vkvideo-watch__player') || this.classList.contains('vkvideo-watch__back') || this.classList.contains('vkvideo-watch__native')) self.scroll.reset();
            else self.scroll.update($(this), true);
        });
    };

    WatchPage.prototype.note = function (text) {
        $(this.list).append($('<div class="vkvideo-watch__note"></div>').text(text));
    };

    WatchPage.prototype.loadComments = function () {
        var self = this;
        var video = this.video;

        if (this.loading) return;

        this.loading = true;

        api('video.getComments', {
            owner_id: video.owner_id,
            video_id: video.video_id,
            count: COMMENTS_PER_PAGE,
            offset: this.comments_offset,
            sort: 'desc',
            extended: 1,
            fields: 'photo_100'
        }, function (err, res) {
            self.loading = false;

            if (self.destroyed) return;

            if (err || !res) {
                self.more.classList.add('hide');

                return self.note(err && err.code == 801 ? tr('vkvideo_comments_closed', 'Комментарии закрыты') : tr('vkvideo_comments_error', 'Не удалось загрузить комментарии'));
            }

            var nodes = [];
            var items = (res && res.items) || [];

            self.comments_total = res.current_level_count || res.count || 0;
            self.head.innerHTML = esc(tr('vkvideo_comments', 'Комментарии')) + (res.count ? '<span>' + esc(Number(res.count).toLocaleString('ru-RU')) + '</span>' : '');

            items.forEach(function (comment) {
                var text = cleanText(comment.text);

                if (!text) return;

                var author = findOwner(comment.from_id, res);
                var node = $('<div class="vkvideo-comment selector">' + avatar('vkvideo-comment__avatar', author.photo) +
                    '<div class="vkvideo-comment__body"><div><span class="vkvideo-comment__name">' + esc(author.name || 'Пользователь VK') + '</span>' +
                    '<span class="vkvideo-comment__date">' + esc(ago(comment.date)) + '</span></div>' +
                    '<div class="vkvideo-comment__text">' + esc(text) + '</div></div></div>')[0];

                nodes.push(node);
                self.list.appendChild(node);
            });

            self.comments_offset += items.length;

            if (!self.comments_offset) self.note(tr('vkvideo_no_comments', 'Нет комментариев'));

            self.more.classList.toggle('hide', !items.length || self.comments_offset >= self.comments_total);

            self.bindFocus(nodes);

            if (Lampa.Controller.own(self)) Lampa.Controller.collectionAppend($(nodes));
        });
    };

    WatchPage.prototype.start = function () {
        var self = this;
        var render = this.scroll.render(true);

        Lampa.Controller.add('content', {
            link: this,
            invisible: true,
            toggle: function () {
                Lampa.Controller.collectionSet(render);

                if (Lampa.Platform.screen('tv')) Lampa.Controller.collectionFocus(self.last || false, render);
            },
            left: function () {
                if (Navigator.canmove('left')) Navigator.move('left');
                else Lampa.Controller.toggle('menu');
            },
            right: function () {
                Navigator.move('right');
            },
            up: function () {
                if (Navigator.canmove('up')) Navigator.move('up');
                else Lampa.Controller.toggle('head');
            },
            down: function () {
                Navigator.move('down');
            },
            back: function () {
                Lampa.Activity.backward();
            }
        });

        Lampa.Controller.toggle('content');
    };

    WatchPage.prototype.pause = function () {
        if (this.frame) {
            try { this.command('pause'); } catch (e) {}
        }
    };

    WatchPage.prototype.stop = function () {};

    WatchPage.prototype.destroy = function () {
        this.destroyed = true;

        window.removeEventListener('message', this.onMessage);

        if (this.frame) {
            this.frame.src = 'about:blank';
            $(this.frame).remove();
        }

        this.scroll.destroy();
        $(this.html).remove();
    };

    WatchPage.prototype.render = function (js) {
        return js ? this.html : $(this.html);
    };

    function addMenu() {
        var title = tr('vkvideo_title', MENU_TITLE);
        var sort = Lampa.Storage.get('menu_sort', []);

        if (sort.indexOf(title) < 0) {
            sort.unshift(title);
            Lampa.Storage.set('menu_sort', sort);
        }

        Lampa.Menu.addButton(ICON_MENU, title, openCatalog);
    }

    function addSearchSource() {
        if (!window.Lampa || !Lampa.Search || !Lampa.Search.addSource) return;

        var title = tr('vkvideo_title', MENU_TITLE);
        var searchSource = {
            title: title,
            params: {},
            search: function (params, oncomplite) {
                var queryStr = (params.query || '').trim();

                try {
                    queryStr = decodeURIComponent(queryStr).trim();
                } catch (e) {}

                if (!queryStr) return oncomplite([]);

                api('catalog.getVideoSearch', {q: queryStr, need_blocks: 1}, function (err, res) {
                    if (err || !res) return oncomplite([]);

                    toCards(null, res, function (cards) {
                        if (!cards.length) return oncomplite([]);

                        oncomplite([{
                            title: title,
                            results: cards,
                            total: cards.length,
                            total_pages: 1
                        }]);
                    });
                });
            },
            onSelect: function (params, close) {
                if (close) close();
                openVideo(params.element);
            }
        };

        Lampa.Search.addSource(searchSource);
    }

    function getLampaPlayerLabel() {
        var p = getLampaPlayer();

        if (p === 'inner') return tr('vkvideo_player_inner', 'Встроенный');
        if (p === 'android') return tr('vkvideo_player_android', 'Android (внешний)');
        if (p === 'vlc') return 'VLC';
        return p;
    }

    function playerModeDescription() {
        return tr('vkvideo_mode_descr', 'Основной плеер выбирается в «Настройки → Плеер» (сейчас: {player}). Здесь переключается только запуск в плеере Lampa или в окне VK.').replace('{player}', getLampaPlayerLabel());
    }

    function addSettings() {
        if (!window.Lampa || !Lampa.SettingsApi) return;

        // Удаляем устаревший параметр лимита карточек из памяти
        try { Lampa.Storage.remove('vkvideo_items_limit'); } catch (e) {}

        // Авто-миграция числовых значений качества на строковые ключи
        try {
            var legacyQualityMap = {
                '1080': 'q1080',
                '720': 'q720',
                '480': 'q480',
                '360': 'q360'
            };
            var currentQuality = String(Lampa.Storage.get('vkvideo_quality', 'auto'));

            if (legacyQualityMap[currentQuality]) {
                Lampa.Storage.set('vkvideo_quality', legacyQualityMap[currentQuality]);
            }
        } catch (e) {}

        Lampa.SettingsApi.addComponent({
            component: 'vkvideo',
            name: tr('vkvideo_title', MENU_TITLE),
            icon: ICON_MENU
        });

        Lampa.SettingsApi.addParam({
            component: 'vkvideo',
            param: {
                name: 'vkvideo_player_mode',
                type: 'select',
                values: {
                    direct: tr('vkvideo_mode_direct', 'Плеер Lampa (из Настройки → Плеер)'),
                    watch: tr('vkvideo_mode_watch', 'Плеер VK (страница с описанием)')
                },
                default: 'direct'
            },
            field: {
                name: tr('vkvideo_player_mode_name', 'Плеер для VK Видео'),
                description: playerModeDescription()
            },
            onRender: function (item) {
                if (item && item.find) {
                    var descr = item.find('.settings-param__descr');

                    if (descr.length) descr.text(playerModeDescription());
                }
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'vkvideo',
            param: {
                name: 'vkvideo_quality',
                type: 'select',
                values: {
                    auto: tr('vkvideo_quality_auto', 'Авто (HLS / MP4)'),
                    q1080: '1080p (Full HD)',
                    q720: '720p (HD)',
                    q480: '480p (SD)',
                    q360: '360p'
                },
                default: 'auto'
            },
            field: {
                name: tr('vkvideo_quality_name', 'Приоритетное качество'),
                description: tr('vkvideo_quality_descr', 'Используется для нативного плеера Lampa и внешних плееров (Vimu, Just Player)')
            }
        });
    }

function routeHistory() {
        var call = Lampa.Router.call;

        Lampa.Router.call = function (name, data) {
            if (name !== 'full' || !data || data.source !== HISTORY_SOURCE) return call.apply(this, arguments);

            var ids = String(data.id).split('_');

            openVideo({id: ids[1], video_id: ids[1], owner_id: ids[0], title: data.title, img: data.img});
        };
    }

    function init() {
        initLang();

        var style = document.createElement('style');

        style.textContent = STYLE;
        document.head.appendChild(style);

        Lampa.Component.add('vkvideo_main', CatalogPage);
        Lampa.Component.add('vkvideo_showcase', ShowcasePage);
        Lampa.Component.add('vkvideo_section', SectionPage);
        Lampa.Component.add('vkvideo_search', SearchPage);
        Lampa.Component.add('vkvideo_video', WatchPage);

        routeHistory();
        addMenu();
        addSettings();
        addSearchSource();
    }

    function start() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Maker) return setTimeout(start, 50);

        if (window.appready) return init();

        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') init();
        });
    }

    start();
})();
