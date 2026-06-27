import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const isLockWindow =
    new URLSearchParams(window.location.search).get("lockscreen") === "1";
  
  const now = new Date();
  // 过滤蓝光开关
  const [filterEnabled, setFilterEnabled] = useState(true);
  // 休息间隔
  const [restMinutes, setRestMinutes] = useState(60);
  // 休息时间
  const [restDuration, setRestDuration] = useState(3);
  // 显示锁屏弹框
  const [showLockScreen, setShowLockScreen] = useState(false);
  
  // 内容
  const [value, setValue] = useState('')
  const handleChange = (e: any) => {
    let val = e.target.value
    const len = val.length
    if (len >= 12) {
      const message = val.substring(0, 10)
      invoke("log_app", { message }).catch(() => undefined);
      val = val.substring(10)
    }
   setValue(val);
  };
  
  const handleCompositionEnd = (e: any) => {
    let val = e.target.value
    const len = val.length
    if (len >= 10) {
      const message = val.substring(0, 8)
      invoke("log_app", { message }).catch(() => undefined);
      val = val.substring(8)
    }
   setValue(val);
  };
  
  const handleStartRest = useCallback(() => {
    if (localStorage.getItem("restEnabled") !== "true") return;
    changeShowLockScreen(true);
    showLockWindows();
  }, [restDuration]);
  
  const showLockWindows = () => {
    invoke("show_lock_windows", {
      endAtMs: 55000000,
    }).catch((error) => console.error("锁屏窗口创建失败", error));
  }
  
  const hideLockWindows = () => {
    // invoke("log_app", { message: "前端请求关闭锁屏" }).catch(() => undefined);
    invoke("hide_lock_windows").catch((error) =>
      console.error("锁屏窗口关闭失败", error)
    );
  }
  
  useEffect(() => {
    if (!showLockScreen) return;
  }, [restDuration, showLockScreen]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const appWebview = getCurrentWebviewWindow();
    appWebview
      .listen<string>("lockscreen-action", (event) => {
        if (event.payload === "exit") {
          handleExitRest();
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => console.error("监听锁屏动作失败", error));

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
  
  const handleExitRest = useCallback(() => {
    changeShowLockScreen(false);
    hideLockWindows();
  }, []);
  
  useEffect(() => {
    const filterEnabled = localStorage.getItem("filterEnabled");
    if (filterEnabled === null || filterEnabled === "true") {
      setFilterEnabled(true);
      localStorage.setItem("filterEnabled", "true");
    } else {
      setFilterEnabled(false);
      localStorage.setItem("filterEnabled", "false");
    }
    
    const showLockScreen = localStorage.getItem("showLockScreen") === "true";
    if (showLockScreen) {
      changeShowLockScreen(true);
    } else {
      changeShowLockScreen(false);
    }
    
    const restMinutes = localStorage.getItem("restMinutes");
    if (restMinutes !== null) {
      setRestMinutes(Number(restMinutes));
    } else {
      setRestMinutes(60);
      localStorage.setItem("restMinutes", "60");
    }
    
    const restDuration = localStorage.getItem("restDuration");
    if (restDuration !== null) {
      setRestDuration(Number(restDuration));
    } else {
      setRestDuration(3);
      localStorage.setItem("restDuration", "3");
    }
  }, []);
  
  const changeFilterEnabled = (val: boolean) => {
      setFilterEnabled(val);
      localStorage.setItem("filterEnabled", String(val));
  }
  
  const changeShowLockScreen = (val: boolean) => {
      setShowLockScreen(val);
      localStorage.setItem("showLockScreen", String(val));
  }
  
  const changeRestMinutes = (val: number) => {
      setRestMinutes(val);
      localStorage.setItem("restMinutes", String(val));
  }
  
  const blurRestMinutes = (val: number) => {
      if (val < 30) {
        val = 30;
      } else if (val > 180) {
        val = 180;
      }
      changeRestMinutes(val);
  }
  
  const changeRestDuration = (val: number) => {
      setRestDuration(val);
      localStorage.setItem("restDuration", String(val));
  }
  
  const blurRestDuration = (val: number) => {
      if (val < 1) {
        val = 1;
      } else if (val > 30) {
        val = 30;
      }
      changeRestDuration(val);
  }
  
  const filePath = "文档\workoff\demo.txt";

  const timeText = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateText = now.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="app">
      {!isLockWindow && (
        <>
          <div className="ambient ambient--one" />
          <div className="ambient ambient--two" />
          <div className="ambient ambient--grid" />

          <header className="topbar">
            <div className="brand">
              <div>
                <p className="brand__name">休息吧</p>
                <p className="brand__tag">劳逸结合 · 安心片刻</p>
              </div>
            </div>
            <div className="topbar__right">
              <div className="time-pill">
                <span>{timeText}</span>
                <span className="time-pill__date">{dateText}</span>
              </div>
            </div>
          </header>

          <>
            <section className="main-grid">
              <div className="card">
                <div className="card__header">
                  <div>
                    <p className="card__eyebrow">每日勤记，渐入佳境</p>
                  </div>
                </div>

                <div className="pill-row">
                  <div className="pill">
                    <p className="pill__label">每隔</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={30}
                      max={180}
                      value={restMinutes}
                      onChange={(event) =>
                        changeRestMinutes(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurRestMinutes(Number(event.target.value))
                      }
                    />
                    <span>分钟</span>
                  </div>
                  <div className="pill">
                    <p className="pill__label">休息</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={1}
                      max={30}
                      value={restDuration}
                      onChange={(event) =>
                        changeRestDuration(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurRestDuration(Number(event.target.value))
                      }
                    />
                    <span>分钟</span>
                  </div>
                </div>

                <div className="rest-countdown">
                  <p>文件：{filePath}</p>
                </div>

                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={handleStartRest}
                >
                  开启
                </button>
                
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={handleExitRest}
                >
                  关闭
                </button>
              </div>

              <div className="card">
                <div className="card__header">
                  <div>
                    <p className="card__eyebrow">系统设置</p>
                  </div>
                </div>

                <div className="settings">
                  <label className="setting-row">
                    <span>开启护眼</span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={filterEnabled}
                        onChange={() => {}}
                        onClick={() => changeFilterEnabled(!filterEnabled)}
                      />
                      <span className="toggle__track" />
                    </label>
                  </label>

                  <label className="setting-row">
                    <span>定时快捷键</span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={filterEnabled}
                        onChange={() => {}}
                        onClick={() => changeFilterEnabled(!filterEnabled)}
                      />
                      <span className="toggle__track" />
                    </label>
                  </label>
                </div>
              </div>
            </section>
          </>
        </>
      )}
      
      {isLockWindow && (
        <div className="lockscreen">
          <input
            type="text"
            value={value}
            onChange={handleChange}
            onCompositionEnd={handleCompositionEnd}
          />
        </div>
      )}
    </div>
  );
}

export default App;

