import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { TauriEvent } from '@tauri-apps/api/event'
import { invoke } from "@tauri-apps/api/core";
import { listen } from '@tauri-apps/api/event';
import "./App.css";

function App() {
  const isLockWindow =
    new URLSearchParams(window.location.search).get("lockscreen") === "1";
  // 过滤蓝光开关
  const [filterEnabled, setFilterEnabled] = useState(true);
  // 位置 X
  const [posX, setPosX] = useState(100);
  // 位置 Y
  const [posY, setPosY] = useState(100);
  // 显示锁屏弹框
  const [showLockScreen, setShowLockScreen] = useState(false);
  const defaultConfig = {
    screen_width: 1000.0,
    screen_height: 750.0,
    width: 80.0,
    height: 30.0,
    scale: 1.0,
    x: 100.0,
    y: 100.0,
  };
  const [size, setSize] = useState(defaultConfig)
  
  type Config = {
    screen_width: number,
    screen_height: number,
    width: number,
    height: number,
    scale: number,
    x: number,
    y: number,
  }
  
  // 获取全部屏幕尺寸
  const getScreenInfo = async () => {
    invoke('get_default_size').then((paylod: any) => {
      setSize({
        screen_width: paylod.screen_width,
        screen_height: paylod.screen_height,
        width: paylod.width,
        height: paylod.height,
        scale: paylod.scale,
        x: paylod.x,
        y: paylod.y,
      })
    });
  }
  
  const setStorageSize = async () => {
    await getScreenInfo();
    const screenInfo = localStorage.getItem("screenInfo");
    if (screenInfo === null) {
      setPosX(size.x);
      setPosY(size.y);
      localStorage.setItem("screenInfo", JSON.stringify(size));
    } else {
      const info = JSON.parse(screenInfo);
      if (info.scale == size.scale) {
        setPosX(info.x);
        setPosY(info.y);
      } else {
        const [x, y] = getNewPos(info.x, info.y);
        setPosX(x);
        setPosY(y);
        localStorage.setItem("screenInfo", JSON.stringify(size));
      }
    }
  }
  
  const getNewPos = (oldx: any, oldy: any) => {
    let x = oldx, y = oldy;
    if (oldx < 0) {
      x = 0
    }
    if (oldx > size.screen_width - 80.0) {
      x = size.screen_width - 80.0
    }
    if (oldy < 0) {
      y = 0
    }
    if (oldy > size.screen_height - 30.0) {
      y = size.screen_width - 30.0
    }
    return [x, y]
  }
  
  
  useEffect(() => {
    const id = setTimeout(async() => {
      await getScreenInfo();
    }, 0);
    return () => {
      clearTimeout(id);
    }
  }, [])

  useEffect(() => {
    let unlistenFocus: () => void
    const bindEvent = async () => {
      const appWebview = getCurrentWebviewWindow()
      // 进入前台
      unlistenFocus = await appWebview.listen(TauriEvent.WINDOW_FOCUS, async () => {
        await getScreenInfo();
      })
    }
    bindEvent()
    return () => {
      unlistenFocus?.()
    }
  }, [])
  
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
  
  const handleStartRest = useCallback(async () => {
    if (localStorage.getItem("restEnabled") !== "true") return;
    changeShowLockScreen(true);
    showLockWindows();
  }, [posY]);
  
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
    let unlisten: (() => void) | undefined;
    listen<Config>('default-size', (event) => {
      console.log(
        `downloading ${event.payload}`
      );
    })
    .then((fn) => {
      unlisten = fn;
    });

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
    setStorageSize();
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
    
    const posX = localStorage.getItem("posX");
    if (posX !== null) {
      setPosX(Number(posX));
    } else {
      setPosX(60);
      localStorage.setItem("posX", "60");
    }
    
    const posY = localStorage.getItem("posY");
    if (posY !== null) {
      setPosY(Number(posY));
    } else {
      setPosY(3);
      localStorage.setItem("posY", "3");
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
  
  const changePosX = (val: number) => {
      setPosX(val);
      localStorage.setItem("posX", String(val));
  }
  
  const blurPosX = (val: number) => {
      if (val < 30) {
        val = 30;
      } else if (val > 180) {
        val = 180;
      }
      changePosX(val);
  }
  
  const changePosY = (val: number) => {
      setPosY(val);
      localStorage.setItem("posY", String(val));
  }
  
  const blurPosY = (val: number) => {
      if (val < 1) {
        val = 1;
      } else if (val > 30) {
        val = 30;
      }
      changePosY(val);
  }
  
  const filePath = "文档\\workoff\\demo.txt";
  const dateText = new Date().toLocaleDateString("zh-CN", {
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
                <span className="time-pill__date">{dateText}</span>
              </div>
            </div>
          </header>

          <>
            <section className="main-grid">
              <div className="card">
                <div className="card__header">
                  <div>
                    <p className="card__eyebrow">每日勤记，渐入佳境。</p>
                  </div>
                </div>

                <div className="pill-row">
                  <div className="pill">
                    <p className="pill__label">位置 X</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={0}
                      max={size.screen_width}
                      value={posX}
                      onChange={(event) =>
                        changePosX(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurPosX(Number(event.target.value))
                      }
                    />
                    <span>px</span>
                  </div>
                  <div className="pill">
                    <p className="pill__label">位置 Y</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={0}
                      max={size.screen_height}
                      value={posY}
                      onChange={(event) =>
                        changePosY(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurPosY(Number(event.target.value))
                      }
                    />
                    <span>px</span>
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

