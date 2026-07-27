import { money, num } from "./format";
import { getLocalDashboard, getLocalExpiring, getLocalLowStock } from "./local-store";

function listItems(items: Array<{ name: string }>, empty: string): string {
  if (items.length === 0) return empty;
  return items
    .slice(0, 5)
    .map((item) => item.name)
    .join("، ");
}

export async function getLocalAssistantReply(question: string): Promise<string> {
  const normalized = question.trim().toLowerCase();
  const [dashboard, lowStock, expiring] = await Promise.all([
    getLocalDashboard(),
    getLocalLowStock(),
    getLocalExpiring(),
  ]);

  if (normalized.includes("نن") && normalized.includes("پلور")) {
    return `د نن ورځې ټول پلور ${money(dashboard.stats.today_sales)} دی، او اټکلي ګټه یې ${money(dashboard.stats.today_profit)} ده.`;
  }
  if (normalized.includes("ګټه") || normalized.includes("میاشت")) {
    return `د دې میاشتې خالص پلور ${money(dashboard.monthPl.net_sales)} او اټکلي خالصه ګټه ${money(dashboard.monthPl.net_profit)} ده.`;
  }
  if (normalized.includes("ختم") || normalized.includes("نېټې") || normalized.includes("expiry")) {
    return `په راتلونکو ۳۰ ورځو کې د ختمېدو نېټې ته نږدې توکي: ${listItems(expiring, "هیڅ توکی نشته")}.`;
  }
  if (normalized.includes("کم") || normalized.includes("بیا") || normalized.includes("سټاک")) {
    return `د بیا پېرود لپاره کم-سټاک توکي: ${listItems(lowStock, "هیڅ توکی نشته")}. ټول ${num(lowStock.length)} توکي د لږ تر لږه سټاک حد ته رسېدلي دي.`;
  }
  if (normalized.includes("نغد") || normalized.includes("کیش")) {
    return `د نن ورځې نغدې پیسې ${money(dashboard.stats.cash_on_hand)} دي.`;
  }

  return "زه یوازې د محلي پلور، ګټې، سټاک، او ختمېدو نېټو راپورونو په اړه ځواب ورکولی شم.";
}
