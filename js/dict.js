/* 字典：球隊、分區、事件的中文對照 */
export const TEAMS = {
  108: '洛杉磯天使', 109: '亞利桑那響尾蛇', 110: '巴爾的摩金鶯', 111: '波士頓紅襪', 112: '芝加哥小熊',
  113: '辛辛那提紅人', 114: '克里夫蘭守護者', 115: '科羅拉多洛磯', 116: '底特律老虎', 117: '休士頓太空人',
  118: '堪薩斯市皇家', 119: '洛杉磯道奇', 120: '華盛頓國民', 121: '紐約大都會', 133: '運動家',
  134: '匹茲堡海盜', 135: '聖地牙哥教士', 136: '西雅圖水手', 137: '舊金山巨人', 138: '聖路易紅雀',
  139: '坦帕灣光芒', 140: '德州遊騎兵', 141: '多倫多藍鳥', 142: '明尼蘇達雙城', 143: '費城費城人',
  144: '亞特蘭大勇士', 145: '芝加哥白襪', 146: '邁阿密馬林魚', 147: '紐約洋基', 158: '密爾瓦基釀酒人',
};
export const ABBR = {
  108: 'LAA', 109: 'AZ', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET',
  117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA',
  137: 'SF', 138: 'STL', 139: 'TB', 140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS',
  146: 'MIA', 147: 'NYY', 158: 'MIL',
};
export const teamName = (t) => (t && TEAMS[t.id]) || (t && t.name) || '—'; // 查不到就用 API 的英文名
export const logo = (t, c) => (t && t.id && TEAMS[t.id] ? `<img class="tl ${c || ''}" src="logos/${t.id}.svg" alt="" loading="lazy" onerror="this.remove()">` : '');
export const teamAbbr = (t) => (t && ABBR[t.id]) || (t && (t.abbreviation || t.teamName)) || '';

export const DIVS = { 201: '美聯東區', 202: '美聯中區', 200: '美聯西區', 204: '國聯東區', 205: '國聯中區', 203: '國聯西區' };
export const DIV_ORDER = { 103: [201, 202, 200], 104: [204, 205, 203] };
export const LEAGUE = { 103: '美國聯盟', 104: '國家聯盟' };
export const CLINCH = { z: '例行賽最佳', y: '分區冠軍', w: '外卡', x: '晉級季後賽' };

export const HALF = { Top: '上', Bottom: '下', Middle: '中場', End: '局末' };
export const BASE = { '1B': '一壘', '2B': '二壘', '3B': '三壘', Home: '本壘' };
export const EV = {
  Single: '一壘安打', Double: '二壘安打', Triple: '三壘安打', 'Home Run': '全壘打',
  Walk: '四壞球', 'Intent Walk': '故意四壞球', 'Hit By Pitch': '觸身球',
  Strikeout: '三振', 'Strikeout Double Play': '三振雙殺',
  Groundout: '滾地球出局', Flyout: '飛球出局', Lineout: '平飛球出局', 'Pop Out': '內野高飛球出局',
  Forceout: '封殺出局', 'Grounded Into DP': '滾地球雙殺打', 'Double Play': '雙殺', 'Triple Play': '三殺',
  'Field Error': '因守備失誤上壘', Error: '失誤',
  'Sac Fly': '高飛犧牲打', 'Sac Fly Double Play': '高飛犧牲打雙殺',
  'Sac Bunt': '犧牲觸擊', 'Sac Bunt Double Play': '犧牲觸擊雙殺',
  'Fielders Choice': '野手選擇', 'Fielders Choice Out': '野手選擇出局',
  'Bunt Groundout': '觸擊滾地球出局', 'Bunt Pop Out': '觸擊高飛球出局', 'Bunt Lineout': '觸擊平飛球出局',
  'Catcher Interference': '捕手妨礙打擊', 'Batter Interference': '打者妨礙', 'Fan Interference': '觀眾干擾',
  'Runner Out': '跑者出局', 'Wild Pitch': '暴投', 'Passed Ball': '捕逸', Balk: '投手犯規',
  'Game Advisory': '場上通知', 'Runner Placed On Base': '延長賽跑者置於壘上',
};
export const HIT_EVENTS = ['Single', 'Double', 'Triple', 'Home Run'];
export const KEY_EVENTS = ['Home Run', 'Triple', 'Double', 'Double Play', 'Triple Play', 'Grounded Into DP', 'Field Error', 'Error'];

export function evZh(e) {
  if (!e) return '';
  if (EV[e]) return EV[e];
  let m;
  if ((m = e.match(/^Stolen Base (1B|2B|3B|Home)$/))) return `盜${BASE[m[1]]}成功`;
  if ((m = e.match(/^Caught Stealing (1B|2B|3B|Home)$/))) return `盜${BASE[m[1]]}失敗`;
  if ((m = e.match(/^Pickoff (1B|2B|3B)$/))) return `牽制${BASE[m[1]]}跑者出局`;
  if (/^Pickoff Caught Stealing/.test(e)) return '牽制盜壘失敗';
  return e; // 沒收錄的事件保留英文，不顯示空白
}

export function seriesZh(g) {
  if (!g || g.gameType === 'R') return '';
  const s = g.seriesDescription || '';
  if (g.gameType === 'S') return '春訓';
  if (g.gameType === 'A') return '明星賽';
  const lg = /^AL /i.test(s) ? '美聯' : /^NL /i.test(s) ? '國聯' : '';
  const map = [
    [/wild card/i, '外卡系列賽'], [/division series/i, '分區系列賽'],
    [/championship series/i, '聯盟冠軍賽'], [/world series/i, '世界大賽'],
  ];
  for (const [re, zh] of map) if (re.test(s)) return lg + zh;
  return s;
}
