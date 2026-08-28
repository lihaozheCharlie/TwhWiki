import { useEffect, useRef, useState } from "react";
import { Icon } from "../../shared/ui";

export function DemoKnowledgeBaseNotice({ hasPersonalKnowledgeBase, onCreate, onOpenPersonal }: {
  hasPersonalKnowledgeBase: boolean;
  onCreate: () => void;
  onOpenPersonal: () => void;
}) {
  return <section className="demo-kb-notice" aria-labelledby="demo-kb-notice-title">
    <div className="demo-kb-notice-mark"><Icon name="library" size={19} /></div>
    <div>
      <h2 id="demo-kb-notice-title">这里是演示知识库</h2>
      <p>{hasPersonalKnowledgeBase
        ? "演示内容适合浏览，不建议写入个人材料。你的知识库与这里完全分开。"
        : "可以继续浏览，但不建议把个人材料写在这里。新建独立知识库后，演示内容会原样保留，你的资料也不会混在一起。"}</p>
    </div>
    <button type="button" className="primary-action" onClick={hasPersonalKnowledgeBase ? onOpenPersonal : onCreate}>
      {hasPersonalKnowledgeBase ? "打开我的知识库" : "新建我的知识库"}<Icon name="arrow" size={15} />
    </button>
  </section>;
}

export function CreateKnowledgeBaseDialog({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("我的个人 Wiki");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit(name.trim());
    } catch (reason: any) {
      setSaving(false);
      setError(reason.message || "知识库暂时无法创建，请稍后再试");
    }
  }

  return <div className="kb-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="kb-dialog" role="dialog" aria-modal="true" aria-labelledby="kb-dialog-title" aria-describedby="kb-dialog-description">
      <form onSubmit={submit}>
        <header>
          <div className="kb-dialog-symbol"><Icon name="library" size={22} /></div>
          <div><h2 id="kb-dialog-title">创建自己的知识库</h2><p id="kb-dialog-description">它会与演示库完全分开，之后启动服务时会优先打开。</p></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="关闭"><Icon name="close" size={18} /></button>
        </header>
        <div className="kb-dialog-body">
          <label htmlFor="knowledge-base-name">知识库名称</label>
          <input ref={inputRef} id="knowledge-base-name" value={name} maxLength={40} disabled={saving} onChange={(event) => setName(event.target.value)} />
          <p>创建后会自动打开一个空白知识库；演示内容不会被复制进去。</p>
          {error ? <div className="kb-dialog-error" role="alert">{error}</div> : null}
        </div>
        <footer>
          <button type="button" className="secondary-action" onClick={onClose} disabled={saving}>取消</button>
          <button className="primary-action" disabled={saving || !name.trim()}>{saving ? "正在创建…" : "创建并打开"}</button>
        </footer>
      </form>
    </section>
  </div>;
}
