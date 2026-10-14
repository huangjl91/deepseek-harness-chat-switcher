window.__ModuleLoader__.load({
  id: 'deepseek-harness-chat-switcher',
  factory: () => ({
    apply(ctx) {
      const bridge = globalThis.dshChatModes;
      if (!bridge || bridge.protocolVersion !== 1) throw new Error('聊天模式插件需要桌面桥接层。请先运行仓库中的桌面安装命令，再重启 Harness。');
      ctx.effect(() => {
        const ready = bridge.activate();
        return async () => { await ready; await bridge.deactivate(); };
      }, 'chat-modes: desktop presentation');
    }
  })
});
