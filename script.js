(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var CATS = {
    logos: { t: "LOGOS", s: "Identidade visual e vetorização" },
    artes: { t: "ARTES GRÁFICAS", s: "Composições e peças visuais" },
    vestuario: { t: "VESTUÁRIO", s: "Camisas, camisetas e blusas" }
  };
  var S = { user: [], order: [], dl: false, hideDemo: false };
  var cloud = null, cloudReady = false, adminUser = null, cloudQueue = Promise.resolve();
  var cloudConfig = window.GALERIA_SUPABASE || {};
  if (window.supabase && cloudConfig.url && cloudConfig.anonKey &&
      !String(cloudConfig.url).includes("SEU-PROJETO") && !String(cloudConfig.anonKey).includes("SUA-CHAVE")) {
    cloud = window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey);
  }
  try { S = Object.assign(S, JSON.parse($("#seed").textContent)); } catch (e) {}
  try {
    var saved = localStorage.getItem("galeriaArteAdmin_v1");
    if (saved) S = Object.assign(S, JSON.parse(saved));
  } catch (e) {}
  var CAN = true, ART = null, T;

  function build() {
    var c = document.documentElement.cloneNode(true);
    ["nav", "bar", "grid", "modal", "aList", "fFiles", "aSt"].forEach(function (id) {
      c.querySelector("#" + id).innerHTML = "";
    });
    c.querySelector("#modal").className = "modal";
    c.querySelector("#adm").className = "";
    c.querySelector("#bAdm").setAttribute("hidden", "");
    c.querySelector("body").removeAttribute("style");
    c.querySelector("#seed").textContent = JSON.stringify(S).replace(/</g, "\\u003c");
    return "<!DOCTYPE html>\\n" + c.outerHTML;
  }
  function setStatus(msg) { $("#aSt").textContent = msg; }
  function save() {
    try {
      localStorage.setItem("galeriaArteAdmin_v1", JSON.stringify(S));
    } catch (e) {
      setStatus("Não foi possível salvar o cache local. As alterações online ainda serão tentadas.");
    }
    if (cloud && adminUser) {
      cloudQueue = cloudQueue.then(syncCloud).catch(function (e) {
        console.error(e); setStatus("Falha ao sincronizar com a nuvem: " + (e.message || "verifique a configuração"));
      });
    } else if (!cloud) {
      setStatus("Modo local: configure config.js e o Supabase para publicar alterações online.");
    }
    return true;
  }
  function fileExt(src) {
    if (/^data:image\/svg\+xml/i.test(src)) return "svg";
    if (/^data:image\/png/i.test(src)) return "png";
    if (/^data:image\/jpe?g/i.test(src)) return "jpg";
    if (/^data:image\/gif/i.test(src)) return "gif";
    return "webp";
  }
  async function uploadDataUrl(src, path) {
    var response = await fetch(src), blob = await response.blob();
    var ext = fileExt(src), objectPath = path + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 9) + "." + ext;
    var up = await cloud.storage.from("gallery-images").upload(objectPath, blob, { contentType: blob.type || "image/webp", upsert: false });
    if (up.error) throw up.error;
    return cloud.storage.from("gallery-images").getPublicUrl(objectPath).data.publicUrl;
  }
  async function syncCloud() {
    if (!cloud || !adminUser) return;
    setStatus("Sincronizando projetos e imagens com a nuvem…");
    for (var i = 0; i < S.user.length; i++) {
      var item = S.user[i];
      for (var j = 0; j < (item.files || []).length; j++) {
        var f = item.files[j];
        if (f.src && f.src.indexOf("data:") === 0) f.src = await uploadDataUrl(f.src, item.id);
        if (f.thumb && f.thumb.indexOf("data:") === 0) f.thumb = await uploadDataUrl(f.thumb, item.id + "/thumbs");
      }
    }
    var rows = S.user.map(function (it) {
      return { id: it.id, category: it.cat, title: it.title, description: it.desc || "", year: it.year || "", format: it.fmt || "", tags: it.tags || [], files: it.files || [], sort_order: (S.order || []).indexOf(it.id) < 0 ? 9999 : S.order.indexOf(it.id), updated_at: new Date().toISOString() };
    });
    if (rows.length) {
      var upsert = await cloud.from("gallery_projects").upsert(rows);
      if (upsert.error) throw upsert.error;
    }
    var existing = await cloud.from("gallery_projects").select("id");
    if (existing.error) throw existing.error;
    var keep = S.user.map(function (it) { return it.id; });
    var removeIds = (existing.data || []).map(function (r) { return r.id; }).filter(function (id) { return keep.indexOf(id) < 0; });
    if (removeIds.length) {
      var del = await cloud.from("gallery_projects").delete().in("id", removeIds);
      if (del.error) throw del.error;
    }
    setStatus("Sincronizado com a nuvem. As alterações já estão disponíveis no site publicado.");
  }
  async function loadCloudProjects() {
    if (!cloud) return;
    var result = await cloud.from("gallery_projects").select("*").order("sort_order", { ascending: true });
    if (result.error) throw result.error;
    S.user = (result.data || []).map(function (r) {
      return { id: r.id, cat: r.category, title: r.title, desc: r.description || "", year: r.year || "", fmt: r.format || "", tags: r.tags || [], files: r.files || [] };
    });
    S.order = S.user.map(function (it) { return it.id; });
    try { localStorage.setItem("galeriaArteAdmin_v1", JSON.stringify(S)); } catch (e) {}
  }
  async function checkAdmin(user) {
    if (!cloud || !user) return false;
    var result = await cloud.from("gallery_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (result.error) { console.error(result.error); return false; }
    return !!result.data;
  }
  function openAuth() {
    $("#authError").textContent = ""; $("#authBox").classList.add("on"); $("#authBox").setAttribute("aria-hidden", "false");
  }
  function closeAuth() { $("#authBox").classList.remove("on"); $("#authBox").setAttribute("aria-hidden", "true"); }
  async function startAdmin(user) {
    if (!await checkAdmin(user)) {
      adminUser = null; $("#bAdm").textContent = "Entrar no painel";
      setStatus("Este usuário não está autorizado a administrar a galeria.");
      if (cloud) await cloud.auth.signOut();
      return false;
    }
    adminUser = user; $("#bAdm").textContent = "Painel de edição";
    $("#aOut").hidden = false;
    drawA(); return true;
  }
  async function dl() {
    try {
      var src = curSrc(), a = document.createElement("a");
      a.href = src;
      a.download = (M.it.title + "-" + ((M.it.files[M.i] || {}).label || "arquivo")).replace(/[\\/:*?"<>|]/g, "") + ".png";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { alert("Não foi possível baixar este arquivo."); }
  }
  function uri(svg) { return "data:image/svg+xml;utf8," + encodeURIComponent(svg); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ==========================================================
     IMAGENS DE DEMONSTRAÇÃO
     Edite estas funções/listas para alterar os desenhos-exemplo.
     ========================================================== */
  var PAL = {
    "Colorido": ["#1f6bff", "#0a1a40", "#0a1a40"],
    "Positivo": ["#111", "#111", "#111"],
    "Negativo": ["#fff", "#fff", "#fff"],
    "Monocromático": ["#6b6b6b", "#6b6b6b", "#6b6b6b"]
  };
  function logo(p, full) {
    var m = '<circle cx="100" cy="100" r="62" fill="' + p[0] + '"/><polygon points="100,52 152,140 48,140" fill="none" stroke="' + p[1] + '" stroke-width="8" stroke-linejoin="round"/>';
    return full
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 200">' + m + '<text x="190" y="112" font-family="Georgia,serif" font-size="46" fill="' + p[2] + '" letter-spacing="3">ATELIÊ</text><text x="192" y="140" font-family="Arial,sans-serif" font-size="14" fill="' + p[2] + '" letter-spacing="7">MARCA EXEMPLO</text></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' + m + "</svg>";
  }
  function dLogo(id, t) {
    var f = [];
    Object.keys(PAL).forEach(function (k) { f.push({ label: k, src: uri(logo(PAL[k], true)) }); });
    f.push({ label: "Símbolo", src: uri(logo(PAL.Colorido, false)) });
    return { id: id, cat: "logos", title: t, desc: "Exemplo de demonstração: círculo e triângulo sobrepostos, mostrando versões e o símbolo isolado.", year: "2026", tags: ["demonstração", "símbolo"], fmt: "SVG", demo: true, files: f };
  }
  function poster(w, h, bg, fg, a, b) {
    return uri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '"><rect width="' + w + '" height="' + h + '" fill="' + bg + '"/><text x="' + w * .07 + '" y="' + h * .3 + '" font-family="Georgia,serif" font-size="' + w * .17 + '" fill="' + fg + '">' + a + '</text><circle cx="' + w * .7 + '" cy="' + h * .62 + '" r="' + Math.min(w, h) * .22 + '" fill="' + fg + '" opacity=".9"/><text x="' + w * .07 + '" y="' + h * .94 + '" font-family="Arial,sans-serif" font-size="' + w * .035 + '" fill="' + fg + '" letter-spacing="3">' + b + " · DEMONSTRAÇÃO</text></svg>");
  }
  function dArt(id, t, w, h, bg, fg, a, fmt) {
    return { id: id, cat: "artes", title: t, desc: "Peça de exemplo para demonstrar o grid editorial. Substitua pelo seu trabalho no painel.", year: "2026", tags: ["demonstração", "cartaz"], fmt: fmt, demo: true, files: [{ label: "Arte", src: poster(w, h, bg, fg, a, "EXEMPLO") }] };
  }
  var TC = { "Preto": "#171717", "Azul-marinho": "#0b1f4d", "Azul-royal": "#1f6bff" };
  function tee(c, side) {
    var dark = c !== "#ece7dc", ink = dark ? "#f1ece0" : "#171717";
    var body = '<path d="M110 40 L40 92 L72 142 L100 122 L100 400 L300 400 L300 122 L328 142 L360 92 L290 40 Q200 84 110 40Z" fill="' + c + '" stroke="rgba(0,0,0,.25)" stroke-width="2"/>';
    var pr = '<circle cx="200" cy="220" r="46" fill="none" stroke="' + ink + '" stroke-width="6"/><polygon points="200,190 226,236 174,236" fill="' + ink + '"/><text x="200" y="296" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="' + ink + '" letter-spacing="4">EXEMPLO</text>';
    var bk = '<text x="200" y="150" text-anchor="middle" font-family="Georgia,serif" font-size="22" fill="' + ink + '" letter-spacing="5">ATELIÊ</text>';
    if (side === "print") return uri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="140 160 120 160"><rect x="0" y="0" width="400" height="440" fill="#fff"/>' + pr.replace(/#f1ece0/g, "#171717") + "</svg>");
    if (side === "detail") return uri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="168 180 64 64"><rect x="0" y="0" width="400" height="440" fill="' + c + '"/><polygon points="200,190 226,236 174,236" fill="' + ink + '"/></svg>');
    return uri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440">' + body + (side === "back" ? bk : pr) + '<text x="200" y="428" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#888">DEMONSTRAÇÃO</text></svg>');
  }

  /* Lista de exemplos exibidos na galeria. */
  var DEMO = [
    dLogo("d-l1", "Marca exemplo A"),
    dLogo("d-l2", "Marca exemplo B"),
    dArt("d-a1", "Cartaz vertical", 600, 800, "#0a1a40", "#dbe8ff", "Noite", "600×800"),
    dArt("d-a2", "Banner horizontal", 800, 500, "#1f6bff", "#03060d", "Festa", "800×500"),
    dArt("d-a3", "Arte quadrada", 600, 600, "#dbe8ff", "#1f6bff", "Verso", "1080×1080"),
    dArt("d-a4", "Capa vertical", 500, 750, "#03060d", "#4da3ff", "Capa", "500×750"),
    { id: "d-v1", cat: "vestuario", title: "Camiseta exemplo", desc: "Mockup de demonstração com frente, costas, estampa isolada, variações de cor e detalhe.", year: "2026", tags: ["demonstração", "camiseta"], fmt: "", demo: true, gen: tee, files: [] }
  ];

  function all() {
    var a = (S.hideDemo ? [] : DEMO).concat(S.user), o = S.order || [];
    return a.sort(function (x, y) {
      var i = o.indexOf(x.id), j = o.indexOf(y.id);
      return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
    });
  }
  function thumb(it) {
    if (it.gen) return it.gen(TC.Preto, "front");
    var f = it.files[0];
    return f ? (f.thumb || f.src) : "";
  }

  /* Capas das categorias: altere os SVGs dentro de navArt. */
  var cur = "all";
  var navArt = {
    logos: '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="#08142e"/><circle cx="170" cy="130" r="64" fill="#1f6bff"/><polygon points="170,70 230,170 110,170" fill="none" stroke="#dbe8ff" stroke-width="7"/></svg>',
    artes: '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="#050914"/><text x="24" y="110" font-family="Georgia,serif" font-size="82" fill="#dbe8ff">Aa</text><rect x="250" y="40" width="110" height="150" fill="#1f6bff"/><circle cx="305" cy="115" r="34" fill="#8fbcff"/></svg>',
    vestuario: '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="#0f2250"/><g transform="translate(110 10) scale(.45)"><path d="M110 40 L40 92 L72 142 L100 122 L100 400 L300 400 L300 122 L328 142 L360 92 L290 40 Q200 84 110 40Z" fill="#04060c"/><circle cx="200" cy="220" r="46" fill="none" stroke="#4da3ff" stroke-width="8"/></g></svg>'
  };

  function drawNav() {
    var h = "";
    Object.keys(CATS).forEach(function (k) {
      h += '<button class="nc' + (cur === k ? " on" : "") + '" data-c="' + k + '">' + navArt[k] + "<span><b>" + CATS[k].t + "</b><small>" + CATS[k].s + "</small></span></button>";
    });
    $("#nav").innerHTML = h;
    $("#bar").innerHTML = '<button class="btn' + (cur === "all" ? " on" : '') + '" data-c="all">Ver todas as categorias</button><span class="meta">' + all().length + " projetos</span>";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-c]");
    if (b && (b.classList.contains("nc") || b.parentNode.id === "bar")) {
      var c = b.getAttribute("data-c");
      cur = (cur === c && c !== "all") ? "all" : c;
      go();
    }
  });
  function go() {
    var g = $("#grid");
    g.classList.add("out");
    setTimeout(function () { drawNav(); render(); g.classList.remove("out"); }, 230);
  }

  /* Montagem das galerias */
  function capH(it) {
    return '<div class="cap"><b>' + esc(it.title) + (it.demo ? ' <span class="demo">demonstração</span>' : "") + '</b><span class="meta">' + [it.year, it.fmt].filter(Boolean).join(" · ") + "</span></div>";
  }
  function sec(k, items) {
    if (!items.length) return "";
    var h = '<section class="sec"><h2>' + CATS[k].t + '</h2><p class="sub">' + CATS[k].s + "</p>";
    if (k === "logos") h += '<div class="logos">' + items.map(function (it) {
      return '<button class="lg" data-o="' + it.id + '"><div class="stage"><img loading="lazy" alt="' + esc(it.title) + '" src="' + thumb(it) + '"></div>' + capH(it) + "</button>";
    }).join("") + "</div>";
    if (k === "artes") h += '<div class="arts">' + items.map(function (it) {
      return '<figure class="art" data-o="' + it.id + '"><img loading="lazy" alt="' + esc(it.title) + '" src="' + thumb(it) + '"><figcaption class="ov"><b>' + esc(it.title) + '</b><span class="meta">' + esc(it.tags[0] || "Arte") + (it.year ? " · " + esc(it.year) : "") + "</span></figcaption></figure>";
    }).join("") + "</div>";
    if (k === "vestuario") h += '<div class="tees">' + items.map(function (it) {
      return '<button class="tee" data-o="' + it.id + '"><div class="stage"><img loading="lazy" alt="' + esc(it.title) + '" src="' + thumb(it) + '"></div>' + capH(it) + "</button>";
    }).join("") + "</div>";
    return h + "</section>";
  }
  function render() {
    var a = all(), h = "";
    (cur === "all" ? Object.keys(CATS) : [cur]).forEach(function (k) {
      h += sec(k, a.filter(function (i) { return i.cat === k; }));
    });
    $("#grid").innerHTML = h || '<p class="empty">Nenhum projeto nesta categoria. Use o painel de edição para adicionar.</p>';
  }

  /* Visualizador ampliado */
  var M = {};
  function svgText(src) {
    try {
      var i = src.indexOf(","), d = src.slice(i + 1);
      return /;base64/.test(src.slice(0, i)) ? decodeURIComponent(escape(atob(d))) : decodeURIComponent(d);
    } catch (e) { return ""; }
  }
  function openIt(id) {
    var it = all().filter(function (i) { return i.id === id; })[0];
    if (!it) return;
    M = { it: it, bg: "w", i: 0, side: "front", col: TC.Preto, full: false };
    if (it.cat === "logos" && it.files[0] && /negativ/i.test(it.files[0].label)) M.bg = "b";
    mod();
    $("#modal").classList.add("on");
    document.body.style.overflow = "hidden";
  }
  function curSrc() {
    var it = M.it;
    if (it.gen) {
      var s = M.i;
      return s === 0 ? it.gen(M.col, M.side) : it.gen(M.col, s === 1 ? "print" : "detail");
    }
    var f = it.files[M.i] || it.files[0];
    return f ? f.src : "";
  }
  function mod() {
    var it = M.it, h = "", src = curSrc(), k = it.cat;
    var bgcls = k === "logos" ? "bg" + M.bg : "";
    h += '<div class="mb"><div class="mv"><div class="mst ' + bgcls + '" style="' + (k !== "logos" ? "background:var(--card)" : "") + '"><img alt="' + esc(it.title) + '" src="' + src + '"></div>';
    if (k === "logos") h += '<div class="row">' + [["w", "Branco"], ["b", "Preto"], ["g", "Cinza"], ["c", "Quadriculado"]].map(function (x) {
      return '<button class="btn' + (M.bg === x[0] ? " on" : "") + '" data-bg="' + x[0] + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    if (it.gen) {
      h += '<div class="row"><button class="btn' + (M.i === 0 && M.side === "front" ? " on" : '') + '" data-sd="front">Frente</button><button class="btn' + (M.i === 0 && M.side === "back" ? " on" : '') + '" data-sd="back">Costas</button>' + Object.keys(TC).map(function (n) {
        return '<button class="sw' + (M.col === TC[n] ? " on" : "") + '" title="' + n + '" data-cl="' + TC[n] + '" style="background:' + TC[n] + '"></button>';
      }).join("") + '</div><div class="row"><button class="th' + (M.i === 1 ? " on" : '') + '" data-i="1" title="Estampa isolada"><img alt="" src="' + it.gen(M.col, "print") + '"></button><button class="th' + (M.i === 2 ? " on" : '') + '" data-i="2" title="Detalhe"><img alt="" src="' + it.gen(M.col, "detail") + '"></button></div>';
    } else if (it.files.length > 1) {
      h += '<div class="row">' + it.files.map(function (f, i) {
        return '<button class="btn' + (M.i === i ? " on" : "") + '" data-i="' + i + '">' + esc(f.label || "Versão " + (i + 1)) + "</button>";
      }).join("") + "</div>" + (k !== "logos" ? '<div class="row">' + it.files.map(function (f, i) {
        return '<button class="th' + (M.i === i ? " on" : "") + '" data-i="' + i + '"><img alt="" src="' + (f.thumb || f.src) + '"></button>';
      }).join("") + "</div>" : "");
    }
    h += '<div class="row"><button class="btn" data-fs="1">Tela cheia</button>' + ((S.dl && !it.gen && it.files.length) ? '<button class="btn" data-dw="1">Baixar original</button>' + (/svg/.test(src.slice(0, 30)) ? '<button class="btn" data-cp="1">Copiar SVG</button>' : "") : "") + "</div></div>";
    h += '<div class="mi"><div class="eyebrow">' + CATS[k].t + "</div><h3>" + esc(it.title) + "</h3>" + (it.demo ? '<span class="demo">demonstração — não é um trabalho real</span>' : "") + "<p>" + esc(it.desc) + '</p><p class="meta">' + [it.year && "Ano: " + it.year, it.fmt && "Formato: " + it.fmt].filter(Boolean).join(" · ") + "</p><div>" + (it.tags || []).map(function (t) {
      return '<span class="tag">' + esc(t) + "</span>";
    }).join("") + "</div></div></div>";
    $("#modal").className = "modal on" + (M.full ? " full" : "");
    $("#modal").innerHTML = h;
  }
  function closeM() { $("#modal").classList.remove("on"); document.body.style.overflow = ""; }
  $("#x").onclick = closeM;
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeM(); $("#adm").classList.remove("on"); }
  });
  $("#modal").addEventListener("click", function (e) {
    var t = e.target, b;
    if (t === $("#modal")) { closeM(); return; }
    if (b = t.closest("[data-bg]")) M.bg = b.dataset.bg;
    else if (b = t.closest("[data-sd]")) { M.i = 0; M.side = b.dataset.sd; }
    else if (b = t.closest("[data-cl]")) M.col = b.dataset.cl;
    else if (b = t.closest("[data-i]")) {
      M.i = +b.dataset.i;
      var f = M.it.files[M.i];
      if (M.it.cat === "logos" && f) M.bg = /negativ/i.test(f.label || "") ? "b" : (M.bg === "b" ? "w" : M.bg);
    } else if (t.closest("[data-fs]")) M.full = !M.full;
    else if (t.closest("[data-dw]")) { dl(); return; }
    else if (t.closest("[data-cp]")) { try { navigator.clipboard.writeText(svgText(curSrc())); } catch (x) {} return; }
    else return;
    mod();
  });
  document.addEventListener("click", function (e) {
    var o = e.target.closest("[data-o]");
    if (o) openIt(o.dataset.o);
  });

  /* Painel de edição */
  var F = { id: null, files: [] };
  function resetF() {
    F = { id: null, files: [] };
    ["fN", "fD", "fY", "fF", "fG", "fL"].forEach(function (i) { $("#" + i).value = ""; });
    $("#fU").value = "";
    $("#fC").value = "logos";
    $("#fT").textContent = "Novo projeto";
    drawF();
  }
  function drawF() {
    $("#fFiles").innerHTML = F.files.map(function (f, i) {
      return '<div class="li"><span>' + esc(f.label || "Arquivo") + '</span><button class="btn" data-rm="' + i + '">Remover</button></div>';
    }).join("");
  }
  function mkThumb(src, cb) {
    var im = new Image();
    im.onload = function () {
      var s = Math.min(1, 640 / Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.max(1, im.width * s); c.height = Math.max(1, im.height * s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      try { cb(c.toDataURL("image/webp", .82)); } catch (e) { cb(src); }
    };
    im.onerror = function () { cb(src); };
    im.src = src;
  }
  $("#fU").onchange = function () {
    var fs = [].slice.call(this.files), lab = $("#fL").value.trim();
    fs.forEach(function (file) {
      var rd = new FileReader();
      rd.onload = function () {
        var original = rd.result, label = lab || file.name.replace(/\.[^.]+$/, "");
        if (/svg/.test(file.type)) {
          F.files.push({ label: label, src: original }); drawF(); return;
        }
        var im = new Image();
        im.onload = function () {
          var scale = Math.min(1, 1800 / Math.max(im.width, im.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(im.width * scale));
          canvas.height = Math.max(1, Math.round(im.height * scale));
          canvas.getContext("2d").drawImage(im, 0, 0, canvas.width, canvas.height);
          var compact = canvas.toDataURL("image/webp", .82);
          mkThumb(compact, function (thumb) { F.files.push({ label: label, src: compact, thumb: thumb }); drawF(); });
        };
        im.onerror = function () { F.files.push({ label: label, src: original }); drawF(); };
        im.src = original;
      };
      rd.readAsDataURL(file);
    });
  };
  $("#fFiles").onclick = function (e) {
    var b = e.target.closest("[data-rm]");
    if (b) { F.files.splice(+b.dataset.rm, 1); drawF(); }
  };
  $("#fR").onclick = resetF;
  $("#fS").onclick = function () {
    var t = $("#fN").value.trim();
    if (!t) { alert("Informe o título."); return; }
    if (!F.files.length) { alert("Envie ao menos um arquivo."); return; }
    var it = {
      id: F.id || "u" + Date.now(), cat: $("#fC").value, title: t, desc: $("#fD").value,
      year: $("#fY").value.trim(), fmt: $("#fF").value.trim(),
      tags: $("#fG").value.split(",").map(function (x) { return x.trim(); }).filter(Boolean),
      files: F.files
    };
    var i = S.user.map(function (u) { return u.id; }).indexOf(it.id), bak = JSON.stringify(S);
    if (i < 0) S.user.push(it); else S.user[i] = it;
    if (!save()) { S = JSON.parse(bak); return; }
    resetF(); drawA(); go();
  };
  function drawA() {
    $("#aDl").checked = !!S.dl;
    $("#aDemo").checked = !!S.hideDemo;
    $("#aList").innerHTML = all().map(function (it) {
      return '<div class="li"><span>' + esc(it.title) + ' <span class="meta">' + CATS[it.cat].t + '</span></span><span class="row"><button class="btn" data-mv="' + it.id + '|-1">↑</button><button class="btn" data-mv="' + it.id + '|1">↓</button>' + (it.demo ? "" : '<button class="btn" data-ed="' + it.id + '">Editar</button><button class="btn" data-dl="' + it.id + '">✕</button>') + "</span></div>";
    }).join("") || '<p class="meta">Sem projetos.</p>';
  }
  $("#aList").onclick = function (e) {
    var b;
    if (b = e.target.closest("[data-mv]")) {
      var p = b.dataset.mv.split("|"), ids = all().map(function (i) { return i.id; });
      var i = ids.indexOf(p[0]), j = i + +p[1];
      if (j < 0 || j >= ids.length) return;
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
      S.order = ids; save(); drawA(); go();
    } else if (b = e.target.closest("[data-dl]")) {
      if (confirm("Excluir este projeto?")) {
        S.user = S.user.filter(function (u) { return u.id !== b.dataset.dl; });
        save(); drawA(); go();
      }
    } else if (b = e.target.closest("[data-ed]")) {
      var it = S.user.filter(function (u) { return u.id === b.dataset.ed; })[0];
      F = { id: it.id, files: it.files.slice() };
      $("#fC").value = it.cat; $("#fN").value = it.title; $("#fD").value = it.desc || "";
      $("#fY").value = it.year || ""; $("#fF").value = it.fmt || "";
      $("#fG").value = (it.tags || []).join(", ");
      $("#fT").textContent = "Editando: " + it.title;
      drawF(); $("#adm").scrollTo(0, 0);
    }
  };
  $("#aDl").onchange = function () { S.dl = this.checked; save(); };
  $("#aDemo").onchange = function () { S.hideDemo = this.checked; save(); drawA(); go(); };
  $("#bAdm").onclick = async function () {
    if (!cloud) { openAuth(); $("#authError").textContent = "Configure primeiro o arquivo config.js e o projeto Supabase. O modo local continua disponível, mas não publica online."; return; }
    if (!adminUser) { openAuth(); return; }
    drawA(); $("#adm").classList.add("on");
  };
  $("#aX").onclick = function () { $("#adm").classList.remove("on"); };
  $("#aOut").onclick = async function () {
    if (cloud) await cloud.auth.signOut();
    adminUser = null; $("#adm").classList.remove("on"); $("#bAdm").textContent = "Entrar no painel";
  };
  $("#authCancel").onclick = closeAuth;
  $("#authBox").addEventListener("click", function (e) { if (e.target === $("#authBox")) closeAuth(); });
  $("#authForm").onsubmit = async function (e) {
    e.preventDefault();
    if (!cloud) { $("#authError").textContent = "Supabase ainda não foi configurado. Veja o README."; return; }
    var submit = $("#authSubmit"); submit.disabled = true; submit.textContent = "Entrando…"; $("#authError").textContent = "";
    try {
      var login = await cloud.auth.signInWithPassword({ email: $("#authEmail").value.trim(), password: $("#authPassword").value });
      if (login.error) throw login.error;
      if (!await startAdmin(login.data.user)) throw new Error("A conta entrou, mas ainda não tem permissão de administrador. Siga o passo de autorização no README.");
      closeAuth(); $("#adm").classList.add("on"); setStatus("Autenticado. O painel pode publicar alterações online.");
    } catch (err) { $("#authError").textContent = err.message || "Não foi possível entrar."; }
    finally { submit.disabled = false; submit.textContent = "Entrar"; }
  };

  async function boot() {
    drawNav(); render(); drawA();
    if (!cloud) {
      $("#aSt").textContent = "Modo local. Para publicar online, configure config.js e siga o README.";
      return;
    }
    try {
      await loadCloudProjects();
      drawNav(); render(); drawA();
      var session = await cloud.auth.getSession();
      var user = session.data && session.data.session && session.data.session.user;
      if (user && await checkAdmin(user)) { adminUser = user; $("#bAdm").textContent = "Painel de edição"; setStatus("Conectado à nuvem."); }
      else { adminUser = null; setStatus("Galeria conectada à nuvem. Entre para administrar."); }
      cloud.auth.onAuthStateChange(function (event, sessionData) {
        if (!sessionData || !sessionData.user) { adminUser = null; $("#bAdm").textContent = "Entrar no painel"; }
      });
    } catch (err) {
      console.error(err); setStatus("Não foi possível carregar os projetos online. Verifique o SQL e as configurações no README.");
    }
  }
  boot();
})();
