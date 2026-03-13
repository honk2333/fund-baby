import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const TZ = 'Asia/Shanghai';
const nowInTz = () => dayjs().tz(TZ);
const toTz = (input) => (input ? dayjs.tz(input, TZ) : nowInTz());
const isTradingSession = (time = nowInTz()) => {
  const day = time.day();
  if (day < 1 || day > 5) return false;
  const minutes = time.hour() * 60 + time.minute();
  return minutes >= 9 * 60 + 30 && minutes <= 15 * 60 + 10;
};

export const loadScript = (url) => {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || !document.body) return resolve();
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    const cleanup = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
    script.onload = () => {
      cleanup();
      resolve();
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('数据加载失败'));
    };
    document.body.appendChild(script);
  });
};

export const fetchFundNetValue = async (code, date) => {
  if (typeof window === 'undefined') return null;
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=1&sdate=${date}&edate=${date}`;
  try {
    await loadScript(url);
    if (window.apidata && window.apidata.content) {
      const content = window.apidata.content;
      if (content.includes('暂无数据')) return null;
      const rows = content.split('<tr>');
      for (const row of rows) {
        if (row.includes(`<td>${date}</td>`)) {
          const cells = row.match(/<td[^>]*>(.*?)<\/td>/g);
          if (cells && cells.length >= 2) {
            const valStr = cells[1].replace(/<[^>]+>/g, '');
            const val = parseFloat(valStr);
            return isNaN(val) ? null : val;
          }
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const fetchSmartFundNetValue = async (code, startDate) => {
  const today = nowInTz().startOf('day');
  let current = toTz(startDate).startOf('day');
  for (let i = 0; i < 30; i++) {
    if (current.isAfter(today)) break;
    const dateStr = current.format('YYYY-MM-DD');
    const val = await fetchFundNetValue(code, dateStr);
    if (val !== null) {
      return { date: dateStr, value: val };
    }
    current = current.add(1, 'day');
  }
  return null;
};

export const fetchFundDataFallback = async (c) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }
  return new Promise(async (resolve, reject) => {
    const searchCallbackName = `SuggestData_fallback_${Date.now()}`;
    const searchUrl = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(c)}&callback=${searchCallbackName}&_=${Date.now()}`;
    let fundName = '';
    try {
      await new Promise((resSearch, rejSearch) => {
        window[searchCallbackName] = (data) => {
          if (data && data.Datas && data.Datas.length > 0) {
            const found = data.Datas.find(d => d.CODE === c);
            if (found) {
              fundName = found.NAME || found.SHORTNAME || '';
            }
          }
          delete window[searchCallbackName];
          resSearch();
        };
        const script = document.createElement('script');
        script.src = searchUrl;
        script.async = true;
        script.onload = () => {
          if (document.body.contains(script)) document.body.removeChild(script);
        };
        script.onerror = () => {
          if (document.body.contains(script)) document.body.removeChild(script);
          delete window[searchCallbackName];
          rejSearch(new Error('搜索接口失败'));
        };
        document.body.appendChild(script);
        setTimeout(() => {
          if (window[searchCallbackName]) {
            delete window[searchCallbackName];
            resSearch();
          }
        }, 3000);
      });
    } catch (e) {
    }
    const tUrl = `https://qt.gtimg.cn/q=jj${c}`;
    const tScript = document.createElement('script');
    tScript.src = tUrl;
    tScript.onload = () => {
      const v = window[`v_jj${c}`];
      if (v && v.length > 5) {
        const p = v.split('~');
        const name = fundName || p[1] || `未知基金(${c})`;
        const dwjz = p[5];
        const zzl = parseFloat(p[7]);
        const jzrq = p[8] ? p[8].slice(0, 10) : '';
        if (dwjz) {
          resolve({
            code: c,
            name: name,
            dwjz: dwjz,
            gsz: null,
            gztime: null,
            jzrq: jzrq,
            gszzl: null,
            zzl: !isNaN(zzl) ? zzl : null,
            noValuation: true,
            holdings: []
          });
        } else {
          reject(new Error('未能获取到基金数据'));
        }
      } else {
        reject(new Error('未能获取到基金数据'));
      }
      if (document.body.contains(tScript)) document.body.removeChild(tScript);
    };
    tScript.onerror = () => {
      if (document.body.contains(tScript)) document.body.removeChild(tScript);
      reject(new Error('基金数据加载失败'));
    };
    document.body.appendChild(tScript);
  });
};

const fetchTencentIntradaySnapshot = async (code) => {
  try {
    const url = `https://web.ifzq.gtimg.cn/fund/newfund/fundSsgz/getSsgz?app=web&symbol=jj${code}&_=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const result = await response.json();
    if (!(result.code === 0 && result.data && Array.isArray(result.data.data))) {
      return null;
    }

    const yDwjz = parseFloat(result.data.yesterdayDwjz);
    if (!Number.isFinite(yDwjz) || yDwjz <= 0) return null;

    const points = result.data.data
      .map((item) => {
        const timeStr = String(item?.[0] || '');
        const value = Number(item?.[1]);
        if (!/^\d{4}$/.test(timeStr) || !Number.isFinite(value)) return null;
        const formattedTime = `${timeStr.slice(0, 2)}:${timeStr.slice(2)}`;
        const growth = Number((((value - yDwjz) / yDwjz) * 100).toFixed(2));
        return {
          time: formattedTime,
          value,
          growth
        };
      })
      .filter(Boolean);

    if (!points.length) return null;

    return {
      yesterdayDwjz: yDwjz,
      points,
      latest: points[points.length - 1]
    };
  } catch (e) {
    return null;
  }
};

export const fetchFundData = async (c) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('无浏览器环境');
  }
  return new Promise(async (resolve, reject) => {
    const gzUrl = `https://fundgz.1234567.com.cn/js/${c}.js?rt=${Date.now()}`;
    const scriptGz = document.createElement('script');
    scriptGz.src = gzUrl;
    const originalJsonpgz = window.jsonpgz;
    window.jsonpgz = (json) => {
      window.jsonpgz = originalJsonpgz;
      if (!json || typeof json !== 'object') {
        fetchFundDataFallback(c).then(resolve).catch(reject);
        return;
      }
      const gszzlNum = Number(json.gszzl);
      const gzData = {
        code: json.fundcode,
        name: json.name,
        dwjz: json.dwjz,
        gsz: json.gsz,
        gztime: json.gztime,
        jzrq: json.jzrq,
        gszzl: Number.isFinite(gszzlNum) ? gszzlNum : json.gszzl
      };
      const intradayPromise = fetchTencentIntradaySnapshot(c);
      const tencentPromise = new Promise((resolveT) => {
        const tUrl = `https://qt.gtimg.cn/q=jj${c}`;
        const tScript = document.createElement('script');
        tScript.src = tUrl;
        tScript.onload = () => {
          const v = window[`v_jj${c}`];
          if (v) {
            const p = v.split('~');
            resolveT({
              dwjz: p[5],
              zzl: parseFloat(p[7]),
              jzrq: p[8] ? p[8].slice(0, 10) : ''
            });
          } else {
            resolveT(null);
          }
          if (document.body.contains(tScript)) document.body.removeChild(tScript);
        };
        tScript.onerror = () => {
          if (document.body.contains(tScript)) document.body.removeChild(tScript);
          resolveT(null);
        };
        document.body.appendChild(tScript);
      });
      const holdingsPromise = new Promise((resolveH) => {
        const holdingsUrl = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${c}&topline=10&year=&month=&_=${Date.now()}`;
        loadScript(holdingsUrl).then(async () => {
          let holdings = [];
          const html = window.apidata?.content || '';
          const headerRow = (html.match(/<thead[\s\S]*?<tr[\s\S]*?<\/tr>[\s\S]*?<\/thead>/i) || [])[0] || '';
          const headerCells = (headerRow.match(/<th[\s\S]*?>([\s\S]*?)<\/th>/gi) || []).map(th => th.replace(/<[^>]*>/g, '').trim());
          let idxCode = -1, idxName = -1, idxWeight = -1;
          headerCells.forEach((h, i) => {
            const t = h.replace(/\s+/g, '');
            if (idxCode < 0 && (t.includes('股票代码') || t.includes('证券代码'))) idxCode = i;
            if (idxName < 0 && (t.includes('股票名称') || t.includes('证券名称'))) idxName = i;
            if (idxWeight < 0 && (t.includes('占净值比例') || t.includes('占比'))) idxWeight = i;
          });
          const rows = html.match(/<tbody[\s\S]*?<\/tbody>/i) || [];
          const dataRows = rows.length ? rows[0].match(/<tr[\s\S]*?<\/tr>/gi) || [] : html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
          for (const r of dataRows) {
            const tds = (r.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi) || []).map(td => td.replace(/<[^>]*>/g, '').trim());
            if (!tds.length) continue;
            let code = '';
            let name = '';
            let weight = '';
            if (idxCode >= 0 && tds[idxCode]) {
              const m = tds[idxCode].match(/(\d{6})/);
              code = m ? m[1] : tds[idxCode];
            } else {
              const codeIdx = tds.findIndex(txt => /^\d{6}$/.test(txt));
              if (codeIdx >= 0) code = tds[codeIdx];
            }
            if (idxName >= 0 && tds[idxName]) {
              name = tds[idxName];
            } else if (code) {
              const i = tds.findIndex(txt => txt && txt !== code && !/%$/.test(txt));
              name = i >= 0 ? tds[i] : '';
            }
            if (idxWeight >= 0 && tds[idxWeight]) {
              const wm = tds[idxWeight].match(/([\d.]+)\s*%/);
              weight = wm ? `${wm[1]}%` : tds[idxWeight];
            } else {
              const wIdx = tds.findIndex(txt => /\d+(?:\.\d+)?\s*%/.test(txt));
              weight = wIdx >= 0 ? tds[wIdx].match(/([\d.]+)\s*%/)?.[1] + '%' : '';
            }
            if (code || name || weight) {
              holdings.push({ code, name, weight, change: null });
            }
          }
          holdings = holdings.slice(0, 10);
          const needQuotes = holdings.filter(h => /^\d{6}$/.test(h.code) || /^\d{5}$/.test(h.code));
          if (needQuotes.length) {
            try {
              const tencentCodes = needQuotes.map(h => {
                const cd = String(h.code || '');
                if (/^\d{6}$/.test(cd)) {
                  const pfx = cd.startsWith('6') || cd.startsWith('9') ? 'sh' : ((cd.startsWith('4') || cd.startsWith('8')) ? 'bj' : 'sz');
                  return `s_${pfx}${cd}`;
                }
                if (/^\d{5}$/.test(cd)) {
                  return `s_hk${cd}`;
                }
                return null;
              }).filter(Boolean).join(',');
              if (!tencentCodes) {
                resolveH(holdings);
                return;
              }
              const quoteUrl = `https://qt.gtimg.cn/q=${tencentCodes}`;
              await new Promise((resQuote) => {
                const scriptQuote = document.createElement('script');
                scriptQuote.src = quoteUrl;
                scriptQuote.onload = () => {
                  needQuotes.forEach(h => {
                    const cd = String(h.code || '');
                    let varName = '';
                    if (/^\d{6}$/.test(cd)) {
                      const pfx = cd.startsWith('6') || cd.startsWith('9') ? 'sh' : ((cd.startsWith('4') || cd.startsWith('8')) ? 'bj' : 'sz');
                      varName = `v_s_${pfx}${cd}`;
                    } else if (/^\d{5}$/.test(cd)) {
                      varName = `v_s_hk${cd}`;
                    } else {
                      return;
                    }
                    const dataStr = window[varName];
                    if (dataStr) {
                      const parts = dataStr.split('~');
                      if (parts.length > 5) {
                        h.change = parseFloat(parts[5]);
                      }
                    }
                  });
                  if (document.body.contains(scriptQuote)) document.body.removeChild(scriptQuote);
                  resQuote();
                };
                scriptQuote.onerror = () => {
                  if (document.body.contains(scriptQuote)) document.body.removeChild(scriptQuote);
                  resQuote();
                };
                document.body.appendChild(scriptQuote);
              });
            } catch (e) {
            }
          }
          resolveH(holdings);
        }).catch(() => resolveH([]));
      });

      const trendPromise = new Promise(async (resolveTr) => {
        try {
          const pingUrl = `https://fund.eastmoney.com/pingzhongdata/${c}.js?v=${Date.now()}`;
          await loadScript(pingUrl);

          // Data_netWorthTrend 为 [{ x, y, equityReturn, unitMoney }, ...]
          const trend = Array.isArray(window.Data_netWorthTrend)
            ? window.Data_netWorthTrend
            : [];

          let historyTrend = [];
          let yesterdayChange = null;

          if (trend.length > 0) {
            // 仅保留最近 90 个点
            const sliced = trend.slice(-90);
            historyTrend = sliced.map((item) => ({
              x: item.x,
              y: item.y,
              equityReturn: item.equityReturn,
            }));

            const last = sliced[sliced.length - 2];
            if (last && typeof last.equityReturn === 'number') {
              yesterdayChange = last.equityReturn;
            }
          }
          resolveTr({ historyTrend, yesterdayChange });
        } catch (e) {
          resolveTr({ historyTrend: [], yesterdayChange: null });
        }
      });

      Promise.all([tencentPromise, holdingsPromise, trendPromise, intradayPromise]).then(([tData, holdings, trendData, intradayData]) => {
        if (tData) {
          if (tData.jzrq && (!gzData.jzrq || tData.jzrq >= gzData.jzrq)) {
            gzData.dwjz = tData.dwjz;
            gzData.jzrq = tData.jzrq;
            gzData.zzl = tData.zzl;
          }
        }

        const now = nowInTz();
        const todayStr = now.format('YYYY-MM-DD');
        const officialValuationFresh = typeof gzData.gztime === 'string' && gzData.gztime.startsWith(todayStr);
        const intradayFresh = Boolean(intradayData?.latest) && isTradingSession(now);

        if (intradayFresh) {
          gzData.gsz = intradayData.latest.value;
          gzData.gszzl = intradayData.latest.growth;
          gzData.gztime = `${todayStr} ${intradayData.latest.time}`;
          gzData.time = gzData.gztime;
          gzData.valuationSource = 'tencent_intraday';
        } else {
          gzData.time = gzData.gztime || gzData.jzrq || '';
          gzData.valuationSource = officialValuationFresh ? 'eastmoney' : 'last_close';
        }

        const baseNav = Number(gzData.dwjz);
        const pricedHoldings = (holdings || [])
          .map((holding) => {
            const weight = Number(String(holding?.weight || '').replace('%', ''));
            const change = Number(holding?.change);
            if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(change)) {
              return null;
            }
            return { weight, change };
          })
          .filter(Boolean);

        const coveredWeight = pricedHoldings.reduce((sum, item) => sum + item.weight, 0);
        if (Number.isFinite(baseNav) && baseNav > 0 && coveredWeight > 0) {
          const estimatedRate = pricedHoldings.reduce((sum, item) => {
            return sum + (item.weight * item.change);
          }, 0) / 100;

          gzData.estPricedCoverage = coveredWeight / 100;
          gzData.estGszzl = Number(estimatedRate.toFixed(2));
          gzData.estGsz = Number((baseNav * (1 + estimatedRate / 100)).toFixed(4));
          gzData.estTime = intradayFresh
            ? `${todayStr} ${intradayData.latest.time}`
            : (officialValuationFresh ? gzData.gztime : now.format('YYYY-MM-DD HH:mm'));
        } else {
          gzData.estPricedCoverage = 0;
          gzData.estGszzl = null;
          gzData.estGsz = null;
          gzData.estTime = null;
        }

        const { historyTrend, yesterdayChange } = trendData || {};
        resolve({ ...gzData, holdings, historyTrend, yesterdayChange });
      });
    };
    scriptGz.onerror = () => {
      window.jsonpgz = originalJsonpgz;
      if (document.body.contains(scriptGz)) document.body.removeChild(scriptGz);
      reject(new Error('基金数据加载失败'));
    };
    document.body.appendChild(scriptGz);
    setTimeout(() => {
      if (document.body.contains(scriptGz)) document.body.removeChild(scriptGz);
    }, 5000);
  });
};

export const searchFunds = async (val) => {
  if (!val.trim()) return [];
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];
  const callbackName = `SuggestData_${Date.now()}`;
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(val)}&callback=${callbackName}&_=${Date.now()}`;
  return new Promise((resolve, reject) => {
    window[callbackName] = (data) => {
      let results = [];
      if (data && data.Datas) {
        results = data.Datas.filter(d =>
          d.CATEGORY === 700 ||
          d.CATEGORY === '700' ||
          d.CATEGORYDESC === '基金'
        );
      }
      delete window[callbackName];
      resolve(results);
    };
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      delete window[callbackName];
      reject(new Error('搜索请求失败'));
    };
    document.body.appendChild(script);
  });
};

export const fetchShanghaiIndexDate = async () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://qt.gtimg.cn/q=sh000001&_t=${Date.now()}`;
    script.onload = () => {
      const data = window.v_sh000001;
      let dateStr = null;
      if (data) {
        const parts = data.split('~');
        if (parts.length > 30) {
          dateStr = parts[30].slice(0, 8);
        }
      }
      if (document.body.contains(script)) document.body.removeChild(script);
      resolve(dateStr);
    };
    script.onerror = () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      reject(new Error('指数数据加载失败'));
    };
    document.body.appendChild(script);
  });
};

export const fetchLatestRelease = async () => {
  // 暂时禁用版本检查，避免控制台 404 报错
  return null;
  /*
  try {
    const res = await fetch('https://api.github.com/repos/zhengshengning/fund-baby/releases/latest');
    if (!res.ok) return null;
    const data = await res.json();
    return {
      tagName: data.tag_name,
      body: data.body || ''
    };
  } catch (e) {
    return null;
  }
  */
};


export const fetchIntradayData = async (code) => {
  try {
    const snapshot = await fetchTencentIntradaySnapshot(code);
    return snapshot?.points || null;
  } catch (e) {
    console.error('获取分时数据失败', code, e);
    return null;
  }
};
