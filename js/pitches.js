/* 球種名稱、每球結果分類（文字轉播與投手球路共用） */
export const PITCH_ZH = { FF: '四縫線速球', SI: '伸卡球', FT: '二縫線速球', FA: '速球', FC: '切球', SL: '滑球', ST: '橫掃球', SV: '大滑球', CU: '曲球', KC: '指節曲球', CS: '慢曲球', CH: '變速球', FS: '指叉球', FO: '指叉球', KN: '蝴蝶球', SC: '螺旋球', EP: '慢速球' };
/* 每球結果：b 壞球 / s 好球 / f 界外 / x 打進場內 */
export const pitchCls = (e) => {
  const d = e.details || {}, c = (d.call && d.call.description) || d.description || '';
  if (d.isInPlay) return 'x';
  if (/foul/i.test(c)) return 'f';
  if (d.isBall) return 'b';
  if (d.isStrike) return 's';
  return 'b';
};
export const PCALL = { b: '壞球', s: '好球', f: '界外', x: '擊出' };
