import { getLang } from "./index.ts";

// The server's errors have no codes yet, so what a user can run into is matched on its exact English. Anything else shows as sent.
const FA: Record<string, string> = {
  "Can't reach the server.": "اتصال به سرور برقرار نشد.",
  "Unexpected response from server.": "پاسخ نامعتبر از سرور.",
  "Account migration is settling existing trades": "تریدهای قبلی حساب در حال تسویه‌اند",
  "A withdrawal is awaiting confirmation": "یک برداشت در انتظار تأیید است",
  "Agent instance not found": "ایجنت پیدا نشد",
  "Deposit not found": "واریز پیدا نشد",
  "Feedback already reviewed": "این فیدبک قبلاً بررسی شده",
  "Feedback must contain 10–2000 characters": "فیدبک باید بین 10 تا 2000 نویسه باشد",
  "Fresh prices required": "قیمت تازه لازم است",
  "Funding settlement pending": "تسویهٔ فاندینگ در جریان است",
  "Insufficient free withdrawable balance; trial principal is not withdrawable": "موجودی قابل برداشت کافی نیست؛ گرنت تریال قابل برداشت نیست",
  "Invalid agent name": "نام ایجنت معتبر نیست",
  "Invalid code, expired or cancelled withdrawal": "کد نامعتبر است، یا برداشت منقضی یا لغو شده",
  "Invalid EVM address": "آدرس EVM معتبر نیست",
  "Invalid feedback": "فیدبک معتبر نیست",
  "Invalid withdrawal destination": "مقصد برداشت معتبر نیست",
  "Minimum withdrawal is 10 USDT": "حداقل برداشت 10 USDT است",
  "New deposit principal is locked for seven days": "اصل واریز جدید تا هفت روز قفل است",
  "New deposit principal is locked for seven days; free profits and referral income remain withdrawable": "اصل واریز جدید تا هفت روز قفل است؛ سود آزاد و درآمد رفرال قابل برداشت می‌ماند",
  "New trade entries are disabled": "ورود به ترید جدید غیرفعال است",
  "Too many deposit requests": "درخواست واریز بیش از حد است",
  "Trading state is managed automatically": "وضعیت ترید خودکار مدیریت می‌شود",
  "Trial profit withdrawals require at least 50 USDT in confirmed real deposits": "برداشت سود تریال به دست‌کم 50 USDT واریز واقعی تأییدشده نیاز دارد",
  "Trial profit withdrawals require confirmed real deposits of 50 USDT": "برداشت سود تریال به 50 USDT واریز واقعی تأییدشده نیاز دارد",
  "Wait 60 seconds before resending": "قبل از ارسال دوباره 60 ثانیه صبر کنید",
  "Withdrawal is not awaiting OTP": "این برداشت منتظر کد نیست",
  "Withdrawal not found": "برداشت پیدا نشد",
  "Your permanent XENO account is created automatically": "حساب دائمی XENO شما خودکار ساخته می‌شود",
};

/** An error message from the server, in Persian where it's known. Never blank: an unknown one shows as sent. */
export const serverText = (message: string) => (getLang() === "fa" ? (FA[message] ?? message) : message);
