# ⚔️ Final Slop — เว็บเกม MMORPG สไตล์พิกเซล 2.5D (Web Browser Edition)

เกม MMORPG พิกเซลแฟนตาซี 2.5D Isometric ที่สามารถ **เล่นได้ทันทีบนเว็บเบราว์เซอร์ ทั้งคอมพิวเตอร์และมือถือ** โดยไม่ต้องติดตั้งโปรแกรมใดๆ

---

## 🎮 สรุประบบเด่นในเกม
- **101 แผนที่ทั่วทวีป**: เดินสำรวจทะลุเชื่อมต่อกันทุกทิศทาง (ทุ่งหญ้า, ป่าทมิฬ, ถ้ำ, ทะเลทราย, เมืองหลวง, ภูเขาไฟ)
- **14 สายอาชีพ & 66 สกิล**: Novice, Swordsman, Knight, Archer, Hunter, Mage, Wizard, Acolyte, Priest, Thief, Ninja, Merchant, Blacksmith, Alchemist
- **229 เควสต์เนื้อเรื่อง**: ส่งเควสต์ต่อเนื่องอัตโนมัติ (Main Quest m01 - m86) พร้อมแชร์เควสต์กับเพื่อนในปาร์ตี้
- **309 มอนสเตอร์ & 333 อุปกรณ์**: ระบบดรอปของแท้จริง ดึงดูดไอเทมเข้ากระเป๋าอัตโนมัติ
- **เล่นได้ทุกอุปกรณ์**: รองรับทั้งจอคอมพิวเตอร์ (WASD/เมาส์) และหน้าจอมือถือทัชสกรีน

---

## 🚀 วิธีนำขึ้น GitHub เพื่อเล่นบนเบราว์เซอร์ (GitHub Pages)

### ขั้นตอนที่ 1: สร้าง Repository บน GitHub
1. เข้าเว็บไซต์ [github.com](https://github.com) แล้วล็อกอิน
2. กดปุ่ม **"New"** (สร้าง Repository ใหม่)
3. ตั้งชื่อ Repository เช่น `final-slop` หรือ `my-rpg`
4. เลือกเป็น **Public**
5. กดปุ่ม **"Create repository"**

---

### ขั้นตอนที่ 2: อัปโหลดไฟล์ขึ้น GitHub (เลือกวิธีที่สะดวกได้ 2 แบบ)

#### แบบที่ 1: อัปโหลดผ่าน GitHub Desktop หรือหน้าเว็บ (ง่ายที่สุด ไม่ต้องพิมพ์โค้ด)
1. ในหน้า Repository ที่เพิ่งสร้าง กดปุ่ม **"uploading an existing file"**
2. ลากไฟล์และโฟลเดอร์ทั้งหมดในโฟลเดอร์นี้ (`FinalSlop_GitHub`) ไปปล่อยลงในหน้าเว็บ
3. กด **"Commit changes"**

#### แบบที่ 2: ใช้คำสั่ง Git (สำหรับผู้ใช้ Git CLI)
เปิด Terminal / Command Prompt ในโฟลเดอร์นี้ แล้วพิมพ์:
```bash
git init
git add .
git commit -m "Launch Final Slop MMORPG"
git branch -M main
git remote add origin https://github.com/<ชื่อผู้ใช้ของคุณ>/<ชื่อ-repo>.git
git push -u origin main
```

---

### ขั้นตอนที่ 3: เปิดใช้งาน GitHub Pages (เล่นบนเบราว์เซอร์ได้ทันที!)
1. ในหน้า Repository บน GitHub ให้คลิกแท็บ **Settings** (การตั้งค่า)
2. เมนูด้านซ้าย เลือก **Pages**
3. หัวข้อ **Build and deployment > Source**:
   - เลือก **GitHub Actions** (ระบบจะ Deploy อัตโนมัติจากไฟล์ `.github/workflows/deploy.yml`)
   - *หรือ* เลือก **Deploy from a branch** แล้วเลือก branch **main** และโฟลเดอร์ **/ (root)** แล้วกด **Save**
4. รอระบบประมวลผลประมาณ 1-2 นาที คุณจะได้ลิงก์สำหรับเล่นเกม เช่น:
   ```
   https://<ชื่อผู้ใช้ของคุณ>.github.io/<ชื่อ-repo>/
   ```
5. ส่งลิงก์นี้ให้เพื่อนๆ เปิดเล่นบน Chrome, Safari, Edge บนคอมหรือมือถือได้ทันที!

---

## 🌐 การเล่นหลายคนแบบออนไลน์ (Online Multiplayer)
- หากเล่นคนเดียว: สามารถเล่นผ่าน GitHub Pages ได้ทันที ตัวเกมจะบันทึกเซฟลงใน LocalStorage ของเบราว์เซอร์
- หากต้องการเล่นด้วยกันแบบออนไลน์หลายเครื่อง:
  1. นำโฟลเดอร์ `server/` ไปรันบน Cloud ฟรี เช่น [Render.com](https://render.com) (มีไฟล์ `render.yaml` เตรียมไว้ให้แล้ว)
  2. ในหน้าเกม ให้คลิกที่ **เข็มกลัดเมนูระบบ ⚙️** แล้วเลือกเชื่อมต่อ WebSocket URL เซิร์ฟเวอร์ออนไลน์ของคุณได้เลยครับ
