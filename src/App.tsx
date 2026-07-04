import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { TauriEvent } from '@tauri-apps/api/event'
import { invoke } from "@tauri-apps/api/core";
import { listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';
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
  const [screenWidth, setScreenWidth] = useState(1000.0);
  const [screenHeight, setScreenHeight] = useState(750.0);
  // 宽度
  const [width, setWidth] = useState(120);
  // 高度
  const [height, setHeight] = useState(30);
  // 字体大小
  const [fontSize, setFontSize] = useState(14);
  // 显示锁屏弹框
  // const [showLockScreen, setShowLockScreen] = useState(false);
  interface ConfigType {
    screen_width: number;
    screen_height: number;
    width: number;
    height: number;
    scale: number;
    fontSize: number;
    x: number;
    y: number;
  }
  
  // 获取全部屏幕尺寸
  const getScreenInfo = useCallback(async () => {
    invoke("get_default_size").then(async () => {
      const store = await Store.load('config.json');
        // 读取
      const screenInfo: ConfigType | undefined = await store.get('screenInfo');
      if (screenInfo === undefined) return
      setPosX(screenInfo.x);
      setPosY(screenInfo.y);
      setWidth(screenInfo.width);
      setHeight(screenInfo.height);
      setFontSize(screenInfo.fontSize);
      setScreenWidth(screenInfo.screen_width - screenInfo.width);
      setScreenHeight(screenInfo.screen_height - screenInfo.height);
    }).catch(() => undefined);
  }, [setPosX, setPosY, setWidth, setHeight, setFontSize, setScreenWidth, setScreenHeight])
  
  const saveStorageSize = useCallback(async (data: any) => {
    const store = await Store.load('config.json');
      // 读取
    const screenInfo: ConfigType | undefined = await store.get('screenInfo');
    if (screenInfo !== undefined) {
      if (data?.x !== undefined) {
        screenInfo.x = data.x
      }
      if (data?.y !== undefined) {
        screenInfo.y = data.y
      }
      if (data?.width !== undefined) {
        screenInfo.width = data.width
      }
      if (data?.height !== undefined) {
        screenInfo.height = data.height
      }
      if (data?.fontSize !== undefined) {
        screenInfo.fontSize = data.fontSize
      }
      await store.set('screenInfo', screenInfo)
      await store.save();
    }
  }, [])
  
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
    if (len >= 70) {
      const message = val.substring(0, 68)
      invoke("log_app", { message }).catch(() => undefined);
      val = val.substring(68)
    }
   setValue(val);
  };
  
  const handleCompositionEnd = (e: any) => {
    let val = e.target.value
    const len = val.length
    if (len >= 60) {
      const message = val.substring(0, 58)
      invoke("log_app", { message }).catch(() => undefined);
      val = val.substring(58)
    }
   setValue(val);
  };
  
  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      invoke("log_app", { message: e.target.value }).catch(() => undefined);
      setValue('');
      e.preventDefault();
    }
  };
  
  const handleStartRest = useCallback(async () => {
    showLockWindows();
  }, [posY]);
  
  const showLockWindows = useCallback(() => {
    invoke("show_lock_windows", {}).catch((error) => console.error("锁屏窗口创建失败", error));
  }, [])
  
  const hideLockWindows = () => {
    invoke("hide_lock_windows").catch((error) =>
      console.error("锁屏窗口关闭失败", error)
    );
  }
  
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ConfigType>('default-size', (event) => {
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
  }, []);
  
  const changeFilterEnabled = (val: boolean) => {
      setFilterEnabled(val);
      localStorage.setItem("filterEnabled", String(val));
  }
  
  const changePosX = useCallback((val: number) => {
      setPosX(val);
      saveStorageSize({x: val});
  }, [setPosX])
  
  const blurPosX = useCallback((val: number) => {
      if (val < 0) {
        val = 0;
      } else if (val > screenWidth) {
        val = screenWidth;
      }
      changePosX(val);
  }, [screenWidth])
  
  const changePosY = useCallback((val: number) => {
      setPosY(val);
      saveStorageSize({y: val});
  }, [setPosY])
  
  const blurPosY = useCallback((val: number) => {
      if (val < 0) {
        val = 0;
      } else if (val > screenHeight) {
        val = screenHeight;
      }
      changePosY(val);
  }, [screenHeight])
  
  const changeWidth = useCallback((val: number) => {
      setWidth(val);
      saveStorageSize({width: val});
  }, [setWidth])
  
  const blurWidth = useCallback((val: number) => {
      if (val < 5) {
        val = 5;
      } else if (val > screenWidth / 2) {
        val = screenWidth / 2;
      }
      changeWidth(val);
  }, [screenWidth])
  
  const changeHeight = useCallback((val: number) => {
      setHeight(val);
      saveStorageSize({height: val});
  }, [setHeight])
  
  const blurHeight = useCallback((val: number) => {
      if (val < 5) {
        val = 5;
      } else if (val > screenHeight / 2) {
        val = screenHeight / 2;
      }
      changeHeight(val);
  }, [screenHeight])
  
  const changeFontSize = useCallback((val: number) => {
      setFontSize(val);
      saveStorageSize({fontSize: val});
  }, [setFontSize])
  
  const blurFontSize = useCallback((val: number) => {
      if (val < 5) {
        val = 5;
      } else if (val > 150) {
        val = 150;
      }
      changeFontSize(val);
  }, [screenHeight])
  
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
                      max={screenWidth}
                      value={posX}
                      onChange={(event) =>
                        changePosX(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurPosX(Number(event.target.value))
                      }
                    />
                    <span className="pill__span">px</span>
                  </div>
                  <div className="pill">
                    <p className="pill__label">位置 Y</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={0}
                      max={screenHeight}
                      value={posY}
                      onChange={(event) =>
                        changePosY(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurPosY(Number(event.target.value))
                      }
                    />
                    <span className="pill__span">px</span>
                  </div>
                </div>
                
                <div className="pill-row">
                  <div className="pill">
                    <p className="pill__label">长度</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={5}
                      max={screenWidth/2}
                      value={width}
                      onChange={(event) =>
                        changeWidth(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurWidth(Number(event.target.value))
                      }
                    />
                    <span className="pill__span">px</span>
                  </div>
                  <div className="pill">
                    <p className="pill__label">宽度</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={5}
                      max={screenHeight/2}
                      value={height}
                      onChange={(event) =>
                        changeHeight(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurHeight(Number(event.target.value))
                      }
                    />
                    <span className="pill__span">px</span>
                  </div>
                </div>
                
                
                <div className="pill-row">
                  <div className="pill">
                    <p className="pill__label">字体</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={5}
                      max={150}
                      value={fontSize}
                      onChange={(event) =>
                        changeFontSize(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurFontSize(Number(event.target.value))
                      }
                    />
                    <span className="pill__span">px</span>
                  </div>
                  {/* <div className="pill">
                    <p className="pill__label">宽度</p>
                    <input
                      className="pill__input"
                      type="number"
                      min={0}
                      max={screenHeight/2}
                      value={height}
                      onChange={(event) =>
                        changeHeight(Number(event.target.value))
                      }
                      onBlur={(event) =>
                        blurHeight(Number(event.target.value))
                      }
                    />
                    <span className="pill__span">px</span>
                  </div> */}
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
                &nbsp;&nbsp;
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
            style={{
              fontSize: `${Number(fontSize)}px`,
            }}
            onChange={handleChange}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}
    </div>
  );
}

export default App;

