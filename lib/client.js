window.__ModuleLoader__.load({
  id: 'deepseek-harness-chat-switcher',
  factory: () => ({
    apply(ctx) {
      // Desktop updates replace app.asar. Missing optional shell code must never
      // turn an otherwise usable workspace into a failed boot.
      const fallback = () => {
        if (!globalThis.document?.body) return () => {};
        const root = document.createElement('div');
        root.id = 'dsh-chat-fallback';
        root.setAttribute('data-chat-mode', 'browser-fallback');
        root.innerHTML = `<style>
#dsh-chat-fallback{position:fixed;left:174px;top:4px;z-index:2147483646;font:13px "Segoe UI","Microsoft YaHei",sans-serif;-webkit-app-region:no-drag;color:CanvasText}
#dsh-chat-fallback button{font:inherit;color:inherit;border:0;background:Canvas;cursor:pointer;padding:6px 10px;border-radius:7px;-webkit-app-region:no-drag}
#dsh-chat-fallback [role=menu]{position:absolute;top:36px;left:0;min-width:244px;background:Canvas;border:1px solid GrayText;border-radius:10px;padding:6px;box-shadow:0 6px 24px #0002}
#dsh-chat-fallback [role=menuitem]{display:block;text-decoration:none;color:inherit;padding:10px;border-radius:6px}
#dsh-chat-fallback [role=menuitem]:hover{background:ButtonFace}
#dsh-chat-fallback small{display:block;color:GrayText;font-size:11px;margin-top:4px}
#dsh-chat-fallback [hidden]{display:none!important}
</style><button type="button" aria-haspopup="menu" aria-expanded="false" title="DSH 已更新，内置聊天接口暂不可用；可继续在浏览器聊天">工作 ▾</button><div role="menu" hidden><button type="button" role="menuitem">✓ 工作</button><a role="menuitem" href="https://chat.deepseek.com/" target="_blank" rel="noopener noreferrer">聊天（浏览器兼容模式）<small>桌面桥接缺失时继续使用官网</small></a></div>`;
        const toggle = root.querySelector('[aria-haspopup]');
        const menu = root.querySelector('[role=menu]');
        const close = () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
        toggle.addEventListener('click', () => { menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded', String(!menu.hidden)); });
        menu.addEventListener('click', close);
        const outside = event => { if (!root.contains(event.target)) close(); };
        const key = event => { if (event.key === 'Escape') close(); };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', key);
        document.body.append(root);
        return () => { root.remove(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
      };
      if (typeof ctx?.effect !== 'function') return;
      ctx.effect(() => {
        let disposed = false;
        let removeFallback = () => {};
        const bridge = globalThis.dshChatModes;
        const compatible = bridge?.protocolVersion === 1 && typeof bridge.activate === 'function' && typeof bridge.deactivate === 'function';
        const degrade = () => { if (!disposed) { removeFallback(); removeFallback = fallback(); } };
        const deactivate = () => { try { Promise.resolve(bridge?.deactivate?.()).catch(() => {}); } catch {} };
        if (!compatible) degrade();
        else {
          try {
            Promise.resolve(bridge.activate()).then(result => {
              if (disposed) deactivate();
              else if (result && (result.protocolVersion !== 1 || result.active !== true)) { deactivate(); degrade(); }
            }).catch(() => { deactivate(); degrade(); });
          } catch { deactivate(); degrade(); }
        }
        return () => { disposed = true; removeFallback(); if (compatible) deactivate(); };
      }, 'chat-modes: optional desktop presentation');
    }
  })
});
