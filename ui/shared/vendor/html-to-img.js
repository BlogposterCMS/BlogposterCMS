/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/html-to-image@1.11.13/es/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var t = "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {};
function e() {
    throw new Error("setTimeout has not been defined")
}
function n() {
    throw new Error("clearTimeout has not been defined")
}
var r = e
  , o = n;
function i(t) {
    if (r === setTimeout)
        return setTimeout(t, 0);
    if ((r === e || !r) && setTimeout)
        return r = setTimeout,
        setTimeout(t, 0);
    try {
        return r(t, 0)
    } catch (e) {
        try {
            return r.call(null, t, 0)
        } catch (e) {
            return r.call(this, t, 0)
        }
    }
}
"function" == typeof t.setTimeout && (r = setTimeout),
"function" == typeof t.clearTimeout && (o = clearTimeout);
var a, c = [], s = !1, l = -1;
function u() {
    s && a && (s = !1,
    a.length ? c = a.concat(c) : l = -1,
    c.length && f())
}
function f() {
    if (!s) {
        var t = i(u);
        s = !0;
        for (var e = c.length; e; ) {
            for (a = c,
            c = []; ++l < e; )
                a && a[l].run();
            l = -1,
            e = c.length
        }
        a = null,
        s = !1,
        function(t) {
            if (o === clearTimeout)
                return clearTimeout(t);
            if ((o === n || !o) && clearTimeout)
                return o = clearTimeout,
                clearTimeout(t);
            try {
                return o(t)
            } catch (e) {
                try {
                    return o.call(null, t)
                } catch (e) {
                    return o.call(this, t)
                }
            }
        }(t)
    }
}
function h(t, e) {
    this.fun = t,
    this.array = e
}
h.prototype.run = function() {
    this.fun.apply(null, this.array)
}
;
function d() {}
var m = d
  , g = d
  , w = d
  , p = d
  , y = d
  , b = d
  , v = d;
var E = t.performance || {}
  , S = E.now || E.mozNow || E.msNow || E.oNow || E.webkitNow || function() {
    return (new Date).getTime()
}
;
var T = new Date;
var x = {
    nextTick: function(t) {
        var e = new Array(arguments.length - 1);
        if (arguments.length > 1)
            for (var n = 1; n < arguments.length; n++)
                e[n - 1] = arguments[n];
        c.push(new h(t,e)),
        1 !== c.length || s || i(f)
    },
    title: "browser",
    browser: !0,
    env: {},
    argv: [],
    version: "",
    versions: {},
    on: m,
    addListener: g,
    once: w,
    off: p,
    removeListener: y,
    removeAllListeners: b,
    emit: v,
    binding: function(t) {
        throw new Error("process.binding is not supported")
    },
    cwd: function() {
        return "/"
    },
    chdir: function(t) {
        throw new Error("process.chdir is not supported")
    },
    umask: function() {
        return 0
    },
    hrtime: function(t) {
        var e = .001 * S.call(E)
          , n = Math.floor(e)
          , r = Math.floor(e % 1 * 1e9);
        return t && (n -= t[0],
        (r -= t[1]) < 0 && (n--,
        r += 1e9)),
        [n, r]
    },
    platform: "browser",
    release: {},
    config: {},
    uptime: function() {
        return (new Date - T) / 1e3
    }
};
const $ = ( () => {
    let t = 0;
    return () => (t += 1,
    `u${`0000${(Math.random() * 36 ** 4 | 0).toString(36)}`.slice(-4)}${t}`)
}
)();
function C(t) {
    const e = [];
    for (let n = 0, r = t.length; n < r; n++)
        e.push(t[n]);
    return e
}
let P = null;
function R(t={}) {
    return P || (t.includeStyleProperties ? (P = t.includeStyleProperties,
    P) : (P = C(window.getComputedStyle(document.documentElement)),
    P))
}
function A(t, e) {
    const n = (t.ownerDocument.defaultView || window).getComputedStyle(t).getPropertyValue(e);
    return n ? parseFloat(n.replace("px", "")) : 0
}
function L(t, e={}) {
    return {
        width: e.width || function(t) {
            const e = A(t, "border-left-width")
              , n = A(t, "border-right-width");
            return t.clientWidth + e + n
        }(t),
        height: e.height || function(t) {
            const e = A(t, "border-top-width")
              , n = A(t, "border-bottom-width");
            return t.clientHeight + e + n
        }(t)
    }
}
const N = 16384;
function k(t) {
    return new Promise(( (e, n) => {
        const r = new Image;
        r.onload = () => {
            r.decode().then(( () => {
                requestAnimationFrame(( () => e(r)))
            }
            ))
        }
        ,
        r.onerror = n,
        r.crossOrigin = "anonymous",
        r.decoding = "async",
        r.src = t
    }
    ))
}
async function I(t, e, n) {
    const r = "http://www.w3.org/2000/svg"
      , o = document.createElementNS(r, "svg")
      , i = document.createElementNS(r, "foreignObject");
    return o.setAttribute("width", `${e}`),
    o.setAttribute("height", `${n}`),
    o.setAttribute("viewBox", `0 0 ${e} ${n}`),
    i.setAttribute("width", "100%"),
    i.setAttribute("height", "100%"),
    i.setAttribute("x", "0"),
    i.setAttribute("y", "0"),
    i.setAttribute("externalResourcesRequired", "true"),
    o.appendChild(i),
    i.appendChild(t),
    async function(t) {
        return Promise.resolve().then(( () => (new XMLSerializer).serializeToString(t))).then(encodeURIComponent).then((t => `data:image/svg+xml;charset=utf-8,${t}`))
    }(o)
}
const D = (t, e) => {
    if (t instanceof e)
        return !0;
    const n = Object.getPrototypeOf(t);
    return null !== n && (n.constructor.name === e.name || D(n, e))
}
;
function M(t, e, n, r) {
    const o = `.${t}:${e}`
      , i = n.cssText ? function(t) {
        const e = t.getPropertyValue("content");
        return `${t.cssText} content: '${e.replace(/'|"/g, "")}';`
    }(n) : function(t, e) {
        return R(e).map((e => `${e}: ${t.getPropertyValue(e)}${t.getPropertyPriority(e) ? " !important" : ""};`)).join(" ")
    }(n, r);
    return document.createTextNode(`${o}{${i}}`)
}
function H(t, e, n, r) {
    const o = window.getComputedStyle(t, n)
      , i = o.getPropertyValue("content");
    if ("" === i || "none" === i)
        return;
    const a = $();
    try {
        e.className = `${e.className} ${a}`
    } catch (t) {
        return
    }
    const c = document.createElement("style");
    c.appendChild(M(a, n, o, r)),
    e.appendChild(c)
}
const F = "application/font-woff"
  , V = "image/jpeg"
  , q = {
    woff: F,
    woff2: F,
    ttf: "application/font-truetype",
    eot: "application/vnd.ms-fontobject",
    png: "image/png",
    jpg: V,
    jpeg: V,
    gif: "image/gif",
    tiff: "image/tiff",
    svg: "image/svg+xml",
    webp: "image/webp"
};
function U(t) {
    const e = function(t) {
        const e = /\.([^./]*?)$/g.exec(t);
        return e ? e[1] : ""
    }(t).toLowerCase();
    return q[e] || ""
}
function j(t) {
    return -1 !== t.search(/^(data:)/)
}
function O(t, e) {
    return `data:${e};base64,${t}`
}
async function z(t, e, n) {
    const r = await fetch(t, e);
    if (404 === r.status)
        throw new Error(`Resource "${r.url}" not found`);
    const o = await r.blob();
    return new Promise(( (t, e) => {
        const i = new FileReader;
        i.onerror = e,
        i.onloadend = () => {
            try {
                t(n({
                    res: r,
                    result: i.result
                }))
            } catch (t) {
                e(t)
            }
        }
        ,
        i.readAsDataURL(o)
    }
    ))
}
const B = {};
async function W(t, e, n) {
    const r = function(t, e, n) {
        let r = t.replace(/\?.*/, "");
        return n && (r = t),
        /ttf|otf|eot|woff2?/i.test(r) && (r = r.replace(/.*\//, "")),
        e ? `[${e}]${r}` : r
    }(t, e, n.includeQueryParams);
    if (null != B[r])
        return B[r];
    let o;
    n.cacheBust && (t += (/\?/.test(t) ? "&" : "?") + (new Date).getTime());
    try {
        const r = await z(t, n.fetchRequestInit, ( ({res: t, result: n}) => (e || (e = t.headers.get("Content-Type") || ""),
        function(t) {
            return t.split(/,/)[1]
        }(n))));
        o = O(r, e)
    } catch (e) {
        o = n.imagePlaceholder || "";
        let r = `Failed to fetch resource: ${t}`;
        e && (r = "string" == typeof e ? e : e.message),
        r && console.warn(r)
    }
    return B[r] = o,
    o
}
async function _(t, e) {
    return D(t, HTMLCanvasElement) ? async function(t) {
        const e = t.toDataURL();
        return "data:," === e ? t.cloneNode(!1) : k(e)
    }(t) : D(t, HTMLVideoElement) ? async function(t, e) {
        if (t.currentSrc) {
            const e = document.createElement("canvas")
              , n = e.getContext("2d");
            return e.width = t.clientWidth,
            e.height = t.clientHeight,
            null == n || n.drawImage(t, 0, 0, e.width, e.height),
            k(e.toDataURL())
        }
        const n = t.poster
          , r = U(n);
        return k(await W(n, r, e))
    }(t, e) : D(t, HTMLIFrameElement) ? async function(t, e) {
        var n;
        try {
            if (null === (n = null == t ? void 0 : t.contentDocument) || void 0 === n ? void 0 : n.body)
                return await J(t.contentDocument.body, e, !0)
        } catch (t) {}
        return t.cloneNode(!1)
    }(t, e) : t.cloneNode(Q(t))
}
const G = t => null != t.tagName && "SLOT" === t.tagName.toUpperCase()
  , Q = t => null != t.tagName && "SVG" === t.tagName.toUpperCase();
function X(t, e, n) {
    return D(e, Element) && (function(t, e, n) {
        const r = e.style;
        if (!r)
            return;
        const o = window.getComputedStyle(t);
        o.cssText ? (r.cssText = o.cssText,
        r.transformOrigin = o.transformOrigin) : R(n).forEach((n => {
            let i = o.getPropertyValue(n);
            if ("font-size" === n && i.endsWith("px")) {
                const t = Math.floor(parseFloat(i.substring(0, i.length - 2))) - .1;
                i = `${t}px`
            }
            D(t, HTMLIFrameElement) && "display" === n && "inline" === i && (i = "block"),
            "d" === n && e.getAttribute("d") && (i = `path(${e.getAttribute("d")})`),
            r.setProperty(n, i, o.getPropertyPriority(n))
        }
        ))
    }(t, e, n),
    function(t, e, n) {
        H(t, e, ":before", n),
        H(t, e, ":after", n)
    }(t, e, n),
    function(t, e) {
        D(t, HTMLTextAreaElement) && (e.innerHTML = t.value),
        D(t, HTMLInputElement) && e.setAttribute("value", t.value)
    }(t, e),
    function(t, e) {
        if (D(t, HTMLSelectElement)) {
            const n = e
              , r = Array.from(n.children).find((e => t.value === e.getAttribute("value")));
            r && r.setAttribute("selected", "")
        }
    }(t, e)),
    e
}
async function J(t, e, n) {
    return n || !e.filter || e.filter(t) ? Promise.resolve(t).then((t => _(t, e))).then((n => async function(t, e, n) {
        var r, o;
        if (Q(e))
            return e;
        let i = [];
        return i = G(t) && t.assignedNodes ? C(t.assignedNodes()) : D(t, HTMLIFrameElement) && (null === (r = t.contentDocument) || void 0 === r ? void 0 : r.body) ? C(t.contentDocument.body.childNodes) : C((null !== (o = t.shadowRoot) && void 0 !== o ? o : t).childNodes),
        0 === i.length || D(t, HTMLVideoElement) || await i.reduce(( (t, r) => t.then(( () => J(r, n))).then((t => {
            t && e.appendChild(t)
        }
        ))), Promise.resolve()),
        e
    }(t, n, e))).then((n => X(t, n, e))).then((t => async function(t, e) {
        const n = t.querySelectorAll ? t.querySelectorAll("use") : [];
        if (0 === n.length)
            return t;
        const r = {};
        for (let o = 0; o < n.length; o++) {
            const i = n[o].getAttribute("xlink:href");
            if (i) {
                const n = t.querySelector(i)
                  , o = document.querySelector(i);
                n || !o || r[i] || (r[i] = await J(o, e, !0))
            }
        }
        const o = Object.values(r);
        if (o.length) {
            const e = "http://www.w3.org/1999/xhtml"
              , n = document.createElementNS(e, "svg");
            n.setAttribute("xmlns", e),
            n.style.position = "absolute",
            n.style.width = "0",
            n.style.height = "0",
            n.style.overflow = "hidden",
            n.style.display = "none";
            const r = document.createElementNS(e, "defs");
            n.appendChild(r);
            for (let t = 0; t < o.length; t++)
                r.appendChild(o[t]);
            t.appendChild(n)
        }
        return t
    }(t, e))) : null
}
const K = /url\((['"]?)([^'"]+?)\1\)/g
  , Y = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g
  , Z = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
async function tt(t, e, n, r, o) {
    try {
        const i = n ? function(t, e) {
            if (t.match(/^[a-z]+:\/\//i))
                return t;
            if (t.match(/^\/\//))
                return window.location.protocol + t;
            if (t.match(/^[a-z]+:/i))
                return t;
            const n = document.implementation.createHTMLDocument()
              , r = n.createElement("base")
              , o = n.createElement("a");
            return n.head.appendChild(r),
            n.body.appendChild(o),
            e && (r.href = e),
            o.href = t,
            o.href
        }(e, n) : e
          , a = U(e);
        let c;
        if (o) {
            c = O(await o(i), a)
        } else
            c = await W(i, a, r);
        return t.replace(function(t) {
            const e = t.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
            return new RegExp(`(url\\(['"]?)(${e})(['"]?\\))`,"g")
        }(e), `$1${c}$3`)
    } catch (t) {}
    return t
}
function et(t) {
    return -1 !== t.search(K)
}
async function nt(t, e, n) {
    if (!et(t))
        return t;
    const r = function(t, {preferredFontFormat: e}) {
        return e ? t.replace(Z, (t => {
            for (; ; ) {
                const [n,,r] = Y.exec(t) || [];
                if (!r)
                    return "";
                if (r === e)
                    return `src: ${n};`
            }
        }
        )) : t
    }(t, n)
      , o = function(t) {
        const e = [];
        return t.replace(K, ( (t, n, r) => (e.push(r),
        t))),
        e.filter((t => !j(t)))
    }(r);
    return o.reduce(( (t, r) => t.then((t => tt(t, r, e, n)))), Promise.resolve(r))
}
async function rt(t, e, n) {
    var r;
    const o = null === (r = e.style) || void 0 === r ? void 0 : r.getPropertyValue(t);
    if (o) {
        const r = await nt(o, null, n);
        return e.style.setProperty(t, r, e.style.getPropertyPriority(t)),
        !0
    }
    return !1
}
async function ot(t, e) {
    D(t, Element) && (await async function(t, e) {
        await rt("background", t, e) || await rt("background-image", t, e),
        await rt("mask", t, e) || await rt("-webkit-mask", t, e) || await rt("mask-image", t, e) || await rt("-webkit-mask-image", t, e)
    }(t, e),
    await async function(t, e) {
        const n = D(t, HTMLImageElement);
        if ((!n || j(t.src)) && (!D(t, SVGImageElement) || j(t.href.baseVal)))
            return;
        const r = n ? t.src : t.href.baseVal
          , o = await W(r, U(r), e);
        await new Promise(( (r, i) => {
            t.onload = r,
            t.onerror = e.onImageErrorHandler ? (...t) => {
                try {
                    r(e.onImageErrorHandler(...t))
                } catch (t) {
                    i(t)
                }
            }
            : i;
            const a = t;
            a.decode && (a.decode = r),
            "lazy" === a.loading && (a.loading = "eager"),
            n ? (t.srcset = "",
            t.src = o) : t.href.baseVal = o
        }
        ))
    }(t, e),
    await async function(t, e) {
        const n = C(t.childNodes).map((t => ot(t, e)));
        await Promise.all(n).then(( () => t))
    }(t, e))
}
const it = {};
async function at(t) {
    let e = it[t];
    if (null != e)
        return e;
    const n = await fetch(t);
    return e = {
        url: t,
        cssText: await n.text()
    },
    it[t] = e,
    e
}
async function ct(t, e) {
    let n = t.cssText;
    const r = /url\(["']?([^"')]+)["']?\)/g
      , o = (n.match(/url\([^)]+\)/g) || []).map((async o => {
        let i = o.replace(r, "$1");
        return i.startsWith("https://") || (i = new URL(i,t.url).href),
        z(i, e.fetchRequestInit, ( ({result: t}) => (n = n.replace(o, `url(${t})`),
        [o, t])))
    }
    ));
    return Promise.all(o).then(( () => n))
}
function st(t) {
    if (null == t)
        return [];
    const e = [];
    let n = t.replace(/(\/\*[\s\S]*?\*\/)/gi, "");
    const r = new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");
    for (; ; ) {
        const t = r.exec(n);
        if (null === t)
            break;
        e.push(t[0])
    }
    n = n.replace(r, "");
    const o = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi
      , i = new RegExp("((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})","gi");
    for (; ; ) {
        let t = o.exec(n);
        if (null === t) {
            if (t = i.exec(n),
            null === t)
                break;
            o.lastIndex = i.lastIndex
        } else
            i.lastIndex = o.lastIndex;
        e.push(t[0])
    }
    return e
}
async function lt(t, e) {
    if (null == t.ownerDocument)
        throw new Error("Provided element is not within a Document");
    const n = C(t.ownerDocument.styleSheets)
      , r = await async function(t, e) {
        const n = []
          , r = [];
        return t.forEach((n => {
            if ("cssRules"in n)
                try {
                    C(n.cssRules || []).forEach(( (t, o) => {
                        if (t.type === CSSRule.IMPORT_RULE) {
                            let i = o + 1;
                            const a = at(t.href).then((t => ct(t, e))).then((t => st(t).forEach((t => {
                                try {
                                    n.insertRule(t, t.startsWith("@import") ? i += 1 : n.cssRules.length)
                                } catch (e) {
                                    console.error("Error inserting rule from remote css", {
                                        rule: t,
                                        error: e
                                    })
                                }
                            }
                            )))).catch((t => {
                                console.error("Error loading remote css", t.toString())
                            }
                            ));
                            r.push(a)
                        }
                    }
                    ))
                } catch (o) {
                    const i = t.find((t => null == t.href)) || document.styleSheets[0];
                    null != n.href && r.push(at(n.href).then((t => ct(t, e))).then((t => st(t).forEach((t => {
                        i.insertRule(t, i.cssRules.length)
                    }
                    )))).catch((t => {
                        console.error("Error loading remote stylesheet", t)
                    }
                    ))),
                    console.error("Error inlining remote css file", o)
                }
        }
        )),
        Promise.all(r).then(( () => (t.forEach((t => {
            if ("cssRules"in t)
                try {
                    C(t.cssRules || []).forEach((t => {
                        n.push(t)
                    }
                    ))
                } catch (e) {
                    console.error(`Error while reading CSS rules from ${t.href}`, e)
                }
        }
        )),
        n)))
    }(n, e);
    return function(t) {
        return t.filter((t => t.type === CSSRule.FONT_FACE_RULE)).filter((t => et(t.style.getPropertyValue("src"))))
    }(r)
}
function ut(t) {
    return t.trim().replace(/["']/g, "")
}
async function ft(t, e) {
    const n = await lt(t, e)
      , r = function(t) {
        const e = new Set;
        return function t(n) {
            (n.style.fontFamily || getComputedStyle(n).fontFamily).split(",").forEach((t => {
                e.add(ut(t))
            }
            )),
            Array.from(n.children).forEach((e => {
                e instanceof HTMLElement && t(e)
            }
            ))
        }(t),
        e
    }(t);
    return (await Promise.all(n.filter((t => r.has(ut(t.style.fontFamily)))).map((t => {
        const n = t.parentStyleSheet ? t.parentStyleSheet.href : null;
        return nt(t.cssText, n, e)
    }
    )))).join("\n")
}
async function ht(t, e={}) {
    const {width: n, height: r} = L(t, e)
      , o = await J(t, e, !0);
    await async function(t, e) {
        const n = null != e.fontEmbedCSS ? e.fontEmbedCSS : e.skipFonts ? null : await ft(t, e);
        if (n) {
            const e = document.createElement("style")
              , r = document.createTextNode(n);
            e.appendChild(r),
            t.firstChild ? t.insertBefore(e, t.firstChild) : t.appendChild(e)
        }
    }(o, e),
    await ot(o, e),
    function(t, e) {
        const {style: n} = t;
        e.backgroundColor && (n.backgroundColor = e.backgroundColor),
        e.width && (n.width = `${e.width}px`),
        e.height && (n.height = `${e.height}px`);
        const r = e.style;
        null != r && Object.keys(r).forEach((t => {
            n[t] = r[t]
        }
        ))
    }(o, e);
    return await I(o, n, r)
}
async function dt(t, e={}) {
    const {width: n, height: r} = L(t, e)
      , o = await ht(t, e)
      , i = await k(o)
      , a = document.createElement("canvas")
      , c = a.getContext("2d")
      , s = e.pixelRatio || function() {
        let t, e;
        try {
            e = x
        } catch (t) {}
        const n = e && e.env ? e.env.devicePixelRatio : null;
        return n && (t = parseInt(n, 10),
        Number.isNaN(t) && (t = 1)),
        t || window.devicePixelRatio || 1
    }()
      , l = e.canvasWidth || n
      , u = e.canvasHeight || r;
    return a.width = l * s,
    a.height = u * s,
    e.skipAutoScale || function(t) {
        (t.width > N || t.height > N) && (t.width > N && t.height > N ? t.width > t.height ? (t.height *= N / t.width,
        t.width = N) : (t.width *= N / t.height,
        t.height = N) : t.width > N ? (t.height *= N / t.width,
        t.width = N) : (t.width *= N / t.height,
        t.height = N))
    }(a),
    a.style.width = `${l}`,
    a.style.height = `${u}`,
    e.backgroundColor && (c.fillStyle = e.backgroundColor,
    c.fillRect(0, 0, a.width, a.height)),
    c.drawImage(i, 0, 0, a.width, a.height),
    a
}
async function mt(t, e={}) {
    const {width: n, height: r} = L(t, e);
    return (await dt(t, e)).getContext("2d").getImageData(0, 0, n, r).data
}
async function gt(t, e={}) {
    return (await dt(t, e)).toDataURL()
}
async function wt(t, e={}) {
    return (await dt(t, e)).toDataURL("image/jpeg", e.quality || 1)
}
async function pt(t, e={}) {
    const n = await dt(t, e)
      , r = await function(t, e={}) {
        return t.toBlob ? new Promise((n => {
            t.toBlob(n, e.type ? e.type : "image/png", e.quality ? e.quality : 1)
        }
        )) : new Promise((n => {
            const r = window.atob(t.toDataURL(e.type ? e.type : void 0, e.quality ? e.quality : void 0).split(",")[1])
              , o = r.length
              , i = new Uint8Array(o);
            for (let t = 0; t < o; t += 1)
                i[t] = r.charCodeAt(t);
            n(new Blob([i],{
                type: e.type ? e.type : "image/png"
            }))
        }
        ))
    }(n);
    return r
}
async function yt(t, e={}) {
    return ft(t, e)
}
export {yt as getFontEmbedCSS, pt as toBlob, dt as toCanvas, wt as toJpeg, mt as toPixelData, gt as toPng, ht as toSvg};
export default null;
//# sourceMappingURL=/sm/03e62cd41579244a51514ea9dcc2a70766fa505006da1a31b4a6a532e8cbf1fd.map
