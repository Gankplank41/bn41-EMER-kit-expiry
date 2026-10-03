// ชนิดข้อมูลของระบบแจ้งเตือนยากล่องฉุกเฉิน (แยกจาก BN41 MED-TRACK และ BN41 แจ้งเตือนสต๊อกยา โดยสมบูรณ์)

export interface KitBox {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface KitItem {
  id: string;
  boxId: string;
  seq: number | null;
  drugName: string;
  strength: string | null;
  unit: string | null;
  standardQty: number | null; // จำนวนที่ควรมีตามเช็คลิสต์ของกล่อง (ไว้อ้างอิง — ระบบนี้ไม่แจ้งเตือนเรื่องจำนวน)
  createdAt: string;
  updatedAt: string;
}

export interface KitItemLot {
  id: string;
  itemId: string;
  lotNo: string | null;
  quantity: number;
  expiryDate: string | null; // null = ไม่มีของ/ไม่ทราบวันหมดอายุ
  flagged: boolean; // true = วันที่ที่นำเข้ามาดูผิดปกติ (เช่น ปี ค.ศ. ต่ำผิดปกติ) ต้องให้เภสัชกรตรวจสอบ
  createdAt: string;
  updatedAt: string;
}

export interface KitItemWithLots extends KitItem {
  box: Pick<KitBox, "id" | "name">;
  lots: KitItemLot[];
}

export interface AlertSettings {
  id: number;
  telegramChatId: string | null;
  expiryAlertMonths: number[];
  updatedAt: string;
}

export interface NotificationLogEntry {
  id: string;
  lotId: string;
  thresholdKey: string;
  sentAt: string;
  telegramOk: boolean;
  detail: string | null;
}
