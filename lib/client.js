window.__ModuleLoader__.load({ id: "dsh-archive", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";

// dsh-archive client —— 侧边栏归档切换按钮
// 在官方侧边栏会话列表的搜索按钮旁注入一个归档按钮:
//   点击 -> 会话列表切换为归档会话列表;再次点击 -> 恢复普通列表
// 归档列表:顶部搜索框(过滤归档会话)、每行右侧 ⋯ 菜单(恢复 / 删除)
// 数据:useWorkspaces 的 archivedSessionIds + useSessions 的会话摘要
// 恢复/删除走后端 /dsh-archive/restore|delete(官方 state 通道 + 回收站)
var React = require("react");

var CSS = ".ar-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:50%;flex:none;padding:0;font-size:14px}\n" +
  ".ar-btn i{font-size:inherit;line-height:1}\n" +
  ".ar-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n" +
  ".ar-btn.ar-on{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}\n" +
  ".ar-list{flex:1;min-height:0;display:flex;flex-direction:column;padding:0 4px 16px}\n" +
  ".ar-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px}\n" +
  ".ar-head{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:8px 12px 4px;flex:none}\n" +
  ".ar-row{display:flex;align-items:center;gap:4px;cursor:pointer;border-radius:8px;padding:7px 12px;flex:none}\n" +
  ".ar-row:hover{background:var(--dsw-alias-interactive-bg-hover)}\n" +
  ".ar-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;pointer-events:none}\n" +
  ".ar-title{font-size:13px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n" +
  ".ar-date{font-size:11px;color:var(--dsw-alias-label-tertiary)}\n" +
  ".ar-more{flex:none;width:24px;height:24px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:6px;font-size:14px;display:inline-flex;align-items:center;justify-content:center;opacity:0;padding:0}\n" +
  ".ar-row:hover .ar-more{opacity:1}\n" +
  ".ar-more:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n" +
  ".ar-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:12px}\n" +
  ".ar-menu{position:fixed;z-index:1000;min-width:140px;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;box-shadow:var(--dsw-shadow-lv3);padding:4px;overflow:hidden}\n" +
  ".ar-menu-item{padding:7px 12px;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:6px;margin:0 2px;display:flex;align-items:center;gap:6px;white-space:nowrap}\n" +
  ".ar-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}\n" +
  ".ar-menu-item.danger{color:var(--dsw-alias-state-error-primary)}\n";

if (typeof document !== "undefined") {
  if (!document.getElementById("ar-css")) {
    var st = document.createElement("style");
    st.id = "ar-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  if (!document.getElementById("ar-remix")) {
    var lk = document.createElement("link");
    lk.id = "ar-remix";
    lk.rel = "stylesheet";
    lk.href = "/dsh-archive/remixicon.css";
    document.head.appendChild(lk);
  }
}

function ArchiveToggler(props) {
  var useWorkspaces = props.useWorkspaces;
  var useSessions = props.useSessions;
  var open = props.openSession;
  var archivedIds = useWorkspaces(function (s) { return s && s.archivedSessionIds ? s.archivedSessionIds : []; });
  var byId = useSessions(function (s) { return s && s.byId ? s.byId : null; });
  var st0 = React.useState(false);
  var active = st0[0], setActive = st0[1];

  var listElRef = React.useRef(null);
  var queryRef = React.useRef("");
  var deletedRef = React.useRef({}); // 本次会话内已删除的会话(过滤幽灵行)

  React.useEffect(function () {
    // 数据变化时强制重建列表(观察器触发的重建由签名守卫拦截,避免自触发死循环)
    if (listElRef.current) listElRef.current.dataset.sig = "";
    var btn = null;
    var hidden = [];
    var menu = { el: null, id: null };

    function findParts() {
      var sb = document.querySelector('[aria-label="\u641C\u7D22\u4F1A\u8BDD"], [aria-label="Search sessions"]');
      if (!sb) return null;
      var searchDiv = sb.parentElement;
      var slot = searchDiv ? searchDiv.parentElement : null;
      var header = slot ? slot.parentElement : null;
      if (!header || !slot || slot.parentElement !== header) return null;
      // 仅宽模式注入:宽侧边栏的 sectionHeader 含直接的 span(板块标签「会话/工作区」)
      if (header.querySelector(":scope > span") === null) return null;
      return { header: header, slot: slot, btn: sb };
    }

    function restore() {
      for (var i = 0; i < hidden.length; i++) {
        if (hidden[i] && hidden[i].isConnected) hidden[i].style.display = "";
      }
      hidden = [];
      if (listElRef.current && listElRef.current.isConnected) listElRef.current.remove();
      listElRef.current = null;
      queryRef.current = "";
    }

    function closeMenu() {
      if (menu.el) menu.el.style.display = "none";
      menu.id = null;
    }
    function ensureMenu() {
      if (menu.el && menu.el.isConnected) return menu.el;
      var m = document.createElement("div");
      m.className = "ar-menu";
      m.style.display = "none";
      var r = document.createElement("div");
      r.className = "ar-menu-item";
      r.textContent = "\u6062\u590D";
      r.addEventListener("click", function () { var id = menu.id; closeMenu(); if (id) doRestore(id); });
      var d = document.createElement("div");
      d.className = "ar-menu-item danger";
      d.textContent = "\u5220\u9664";
      d.addEventListener("click", function () { var id = menu.id; closeMenu(); if (id) doDelete(id); });
      m.appendChild(r);
      m.appendChild(d);
      document.body.appendChild(m);
      menu.el = m;
      return m;
    }
    function openMenu(id, btnEl) {
      var m = ensureMenu();
      menu.id = id;
      var r = btnEl.getBoundingClientRect();
      var mw = 140, mh = 88;
      m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + "px";
      m.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - mh - 8)) + "px";
      m.style.display = "block";
    }

    function doRestore(id) {
      fetch("/dsh-archive/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id })
      }).then(function (r) { return r.json(); })
        .then(function (d) { if (!d || !d.ok) console.warn("dsh-archive restore failed", d); })
        .catch(function (e) { console.warn("dsh-archive restore failed", e); });
    }
    function doDelete(id) {
      fetch("/dsh-archive/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id })
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            deletedRef.current[id] = true;
            if (listElRef.current) listElRef.current.dataset.sig = "";
            buildList();
          } else if (d && d.message) console.warn("dsh-archive delete failed", d.message);
        })
        .catch(function (e) { console.warn("dsh-archive delete failed", e); });
    }

    function buildList() {
      var list = listElRef.current;
      if (!list) return;
      var body = list.querySelector(".ar-body");
      if (!body) return;
      var visibleIds = archivedIds.filter(function (id) { return !deletedRef.current[id]; });
      var q = queryRef.current.trim().toLowerCase();
      var sig = visibleIds.join("|") + "#" + (byId ? Object.keys(byId).length : 0) + "#" + q;
      if (body.dataset.sig === sig) return;
      body.dataset.sig = sig;
      body.textContent = "";
      var head = document.createElement("div");
      head.className = "ar-head";
      head.textContent = "\u5F52\u6863\u4F1A\u8BDD (" + visibleIds.length + ")";
      body.appendChild(head);
      if (!visibleIds.length) {
        var empty = document.createElement("div");
        empty.className = "ar-empty";
        empty.textContent = "\u6CA1\u6709\u5F52\u6863\u4F1A\u8BDD";
        body.appendChild(empty);
        return;
      }
      var shown = 0;
      visibleIds.forEach(function (id) {
        var s = byId ? byId[id] : null;
        var title = (s && s.title) || id;
        if (q && title.toLowerCase().indexOf(q) < 0) return;
        shown++;
        var row = document.createElement("div");
        row.className = "ar-row";
        var main = document.createElement("div");
        main.className = "ar-row-main";
        var t = document.createElement("div");
        t.className = "ar-title";
        t.textContent = title;
        var d = document.createElement("div");
        d.className = "ar-date";
        d.textContent = (s && s.updatedAt) ? String(s.updatedAt).replace("T", " ").slice(0, 16) : "";
        main.appendChild(t);
        main.appendChild(d);
        var more = document.createElement("button");
        more.type = "button";
        more.className = "ar-more";
        more.innerHTML = '<i class="ri-more-fill"></i>';
        more.addEventListener("click", function (e) {
          e.stopPropagation();
          openMenu(id, more);
        });
        row.appendChild(main);
        row.appendChild(more);
        row.addEventListener("click", function () { if (open) open(id); });
        body.appendChild(row);
      });
      if (!shown) {
        var none = document.createElement("div");
        none.className = "ar-empty";
        none.textContent = "\u6CA1\u6709\u5339\u914D\u7684\u5F52\u6863\u4F1A\u8BDD";
        body.appendChild(none);
      }
    }

    // 复用官方搜索输入框:归档模式下,官方搜索框输入即过滤归档列表
    function attachOfficialSearch() {
      var parts = findParts();
      if (!parts) return;
      var searchDiv = parts.btn.parentElement;
      var input = searchDiv ? searchDiv.querySelector("input") : null;
      if (!input) return;
      queryRef.current = input.value;
      if (input.__arBound) return;
      input.__arBound = true;
      input.addEventListener("input", function () {
        queryRef.current = input.value;
        var body = listElRef.current ? listElRef.current.querySelector(".ar-body") : null;
        if (body) body.dataset.sig = "";
        buildList();
      });
    }

    function applyView() {
      var parts = findParts();
      if (!parts) return;
      var root = parts.header.parentElement;
      if (!root) return;
      var wide = parts.header.querySelector(":scope > span") !== null;
      if (active && wide) {
        if (!listElRef.current || !listElRef.current.isConnected) {
          var list = document.createElement("div");
          list.className = "ar-list";
          root.appendChild(list);
          listElRef.current = list;
          var body = document.createElement("div");
          body.className = "ar-body";
          list.appendChild(body);
        }
        attachOfficialSearch();
        var kids = Array.prototype.slice.call(root.children);
        for (var i = 0; i < kids.length; i++) {
          var k = kids[i];
          if (k === parts.header || k === listElRef.current) continue;
          if (k.style.display !== "none") { k.style.display = "none"; hidden.push(k); }
        }
        buildList();
      } else {
        restore();
        closeMenu();
      }
    }

    function syncButton() {
      var parts = findParts();
      if (!parts) return;
      if (!btn || !btn.isConnected) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML = '<i class="ri-archive-2-line"></i>';
        btn.addEventListener("click", function () { setActive(function (a) { return !a; }); });
        parts.header.insertBefore(btn, parts.slot);
        // 与搜索按钮完全同尺寸(测量真实按钮,宽/高/圆角/图标字号跟随)
        var r = parts.btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          btn.style.width = r.width + "px";
          btn.style.height = r.height + "px";
          btn.style.fontSize = Math.max(12, Math.round(r.height / 2)) + "px";
        }
      }
      var cls = "ar-btn" + (active ? " ar-on" : "");
      if (btn.className !== cls) btn.className = cls;
      var tip = active ? "\u663E\u793A\u5168\u90E8\u4F1A\u8BDD" : "\u67E5\u770B\u5F52\u6863\u4F1A\u8BDD" + (archivedIds.length ? " (" + archivedIds.length + ")" : "");
      if (btn.title !== tip) btn.title = tip;
    }

    function onMutations(muts) {
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (!(t && t.closest && t.closest(".ar-list, .ar-btn, .ar-row, .ar-head, .ar-empty, .ar-body, .ar-more"))) {
          syncButton();
          applyView();
          return;
        }
      }
    }

    function onDocDown(e) {
      if (!menu.el || menu.el.style.display === "none") return;
      if (menu.el.contains(e.target)) return;
      closeMenu();
    }
    function onDocKey(e) { if (e.key === "Escape") closeMenu(); }

    syncButton();
    applyView();
    var obs = new MutationObserver(onMutations);
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onDocKey);
    return function () {
      obs.disconnect();
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onDocKey);
      restore();
      closeMenu();
      if (menu.el && menu.el.isConnected) menu.el.remove();
      if (btn && btn.isConnected) btn.remove();
    };
  }, [active, archivedIds, byId]);

  return null;
}

module.exports = {
  name: "dsh-archive",
  inject: ["slots"],
  apply(ctx) {
    const slots = ctx.get("slots");
    if (slots === void 0) return;
    ctx.effect(() => slots.inject("sidebar.footer.action", () => slots.register(
      { name: "sidebar.footer.action", id: "archive", order: 60 },
      (props) => React.createElement(ArchiveToggler, Object.assign({}, props, {
        openSession: (id) => { try { ctx.sessions.open(id); } catch (e) {} }
      }))
    )));
  }
};

return module.exports; } });
