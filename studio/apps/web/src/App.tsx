import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppShell } from "./app/AppShell";
import { useLiveRevision } from "./shared/routing";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The Way Here 页面渲染失败", error, info);
  }

  render() {
    if (this.state.error) return <div className="fatal-error"><div><span>页面没有正确展开</span><h1>这次没有让整个产品变成白屏</h1><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>重新加载</button></div></div>;
    return this.props.children;
  }
}

export default function App() {
  const revision = useLiveRevision();
  return <AppErrorBoundary><AppShell revision={revision} /></AppErrorBoundary>;
}
