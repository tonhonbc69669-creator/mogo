const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 2567;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json; charset=utf-8",
};

const TRANSPARENT_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
);

const SILENT_MP3 = Buffer.from(
    "fffb906400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    "hex"
);

// ============================================================================
// Persistent Accounts & Multi-Character Database (Cross-Device Ready)
// ============================================================================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

let extractedMonsterDrops = {};
try {
    extractedMonsterDrops = JSON.parse(fs.readFileSync(path.join(__dirname, "drops_extracted.json"), "utf8"));
} catch (e) {
    console.warn("Could not load drops_extracted.json:", e.message);
}

let extractedGearData = {};
try {
    extractedGearData = JSON.parse(fs.readFileSync(path.join(__dirname, "gear_extracted.json"), "utf8"));
} catch (e) {
    console.warn("Could not load gear_extracted.json:", e.message);
}

const ALIAS_MAP = {
    jelly: ["jelly_green", "jelly_blue", "jelly_pink", "jelly_clear"],
    cap: ["shroom_cap", "venom_spore"],
    wing: ["bat_wing", "crystal_chip"],
    silk: ["spider_silk", "glow_silk"],
    lake_fish: ["carp", "perch", "catfish"],
    stream_fish: ["trout", "salmon"]
};

function resolveLootId(id, monsterKind = "") {
    if (ALIAS_MAP[id]) {
        const choices = ALIAS_MAP[id];
        if (id === "jelly") {
            if (monsterKind.includes("blue")) return "jelly_blue";
            if (monsterKind.includes("pink")) return "jelly_pink";
            if (monsterKind.includes("clear") || monsterKind.includes("king")) return "jelly_clear";
            return "jelly_green";
        }
        if (id === "cap") {
            if (monsterKind.includes("venom")) return "venom_spore";
            return "shroom_cap";
        }
        return choices[Math.floor(Math.random() * choices.length)];
    }
    return id;
}

let syncedMaps = {
    aurum: {
        id: "aurum",
        kind: "town",
        start: { x: 0, z: 18, yaw: 0 },
        revive: { x: 0, z: 18, yaw: 0 },
        warps: [
            { id: "south", x: 0, z: 36.6, to: "bull1", via: "north", out: { x: 0, z: 31, yaw: Math.PI } },
            { id: "west", x: -45.8, z: 0, to: "bear1", via: "east", out: { x: -38.5, z: 0, yaw: Math.PI / 2 } },
            { id: "east", x: 45.7, z: 0, to: "pip", via: "west", out: { x: 38.7, z: 0, yaw: -Math.PI / 2 } },
            { id: "north", x: 0, z: -48.2, to: "pass", via: "south", out: { x: 0, z: -40.8, yaw: 0 } }
        ],
        spawns: []
    },
    bull1: {
        id: "bull1",
        kind: "field",
        lv: [1, 5],
        start: { x: 0, z: 37.2, yaw: 0 },
        warps: [
            { id: "north", x: 0, z: 31.4, to: "aurum", via: "south", out: { x: 0, z: 37.2, yaw: 0 } }
        ],
        spawns: [
            { kind: "slime", x: -12, z: 52, r: 9, n: 8, levels: [1, 2], variant: 0 },
            { kind: "slime", x: 14, z: 58, r: 8, n: 6, levels: [1, 2], variant: 0 },
            { kind: "slime", x: 0, z: 78, r: 9, n: 6, levels: [2, 3], variant: 1 },
            { kind: "bunny", x: 29, z: 76, r: 9, n: 5, levels: [3, 4], variant: 0 },
            { kind: "slime", x: -27, z: 94, r: 9, n: 5, levels: [4, 5], variant: 2 },
            { kind: "kingslime", x: 10, z: 124, r: 3, n: 1, levels: [8, 8], variant: 0 }
        ]
    }
};

let syncedMonsters = {
    slime: { hp: 45, atk: 8, exp: 18, coins: 12, speed: 1.4, radius: 0.45, reach: 1.1 },
    bunny: { hp: 70, atk: 12, exp: 28, coins: 18, speed: 1.7, radius: 0.45, reach: 1.1 },
    kingslime: { hp: 450, atk: 28, exp: 220, coins: 150, speed: 1.3, radius: 0.9, reach: 1.6, boss: "mini" }
};

let syncedExtras = {
    quests: {
        m01: { kind: "main", giver: null, turnIn: "guide", level: 1, goals: [{ kind: "talk", npc: "guide" }], reward: { zeny: 50, exp: 50, items: [{ id: "potion_red", qty: 3 }] } },
        m02: { kind: "main", giver: "guide", turnIn: "guide", level: 1, after: "m01", goals: [{ kind: "kill", monsters: ["slime"], n: 5 }], reward: { zeny: 80, exp: 80, items: [{ id: "cloth_tunic", qty: 1 }] } }
    },
    gear: {
        wooden_sword: { slot: "weapon", weapon: "sword", rarity: "common", level: 1, add: { atk: 3 }, price: 60, sell: 20 },
        iron_sword: { slot: "weapon", weapon: "sword", rarity: "common", level: 3, add: { atk: 7 }, price: 300, sell: 120 },
        cloth_tunic: { slot: "body", rarity: "common", level: 1, add: { def: 2, hp: 10 }, price: 50, sell: 20 },
        leather_boots: { slot: "feet", rarity: "common", level: 2, add: { agi: 1, def: 1 }, price: 80, sell: 30 }
    },
    potions: {
        potion_red: { heal: 60, mp: 0, price: 20, rarity: "common" },
        potion_orange: { heal: 160, mp: 0, price: 60, rarity: "common" },
        potion_white: { heal: 400, mp: 0, price: 160, rarity: "rare" },
        potion_blue: { heal: 0, mp: 60, price: 50, rarity: "common" },
        wing_home: { heal: 0, mp: 0, price: 60, rarity: "common", home: true },
        tome_forget: { heal: 0, mp: 0, price: 0, rarity: "epic", forget: true },
        tome_renew: { heal: 0, mp: 0, price: 0, rarity: "epic", forget: true }
    },
    forge: {},
    lootPrices: {},
    drops: extractedMonsterDrops,
    eggs: {
        egg_slime: { price: 6000, minutes: 30, hatch: [["slime", 1]] },
        egg_bunny: { price: 6000, minutes: 30, hatch: [["bunny", 1]] },
        egg_wolf: { price: 12000, minutes: 30, hatch: [["wolf", 1]] },
        egg_wisp: { price: 12000, minutes: 30, hatch: [["wisp", 1]] },
        egg_mystery: { price: 9000, minutes: 45, hatch: [["slime", 0.3], ["bunny", 0.3], ["wolf", 0.2], ["wisp", 0.15], ["bear", 0.05]] }
    },
    pets: {},
    crops: {
        carrot: { lv: 1, minutes: 30, seed: 20, yield: [2, 4], exp: 15 },
        potato: { lv: 3, minutes: 45, seed: 30, yield: [2, 4], exp: 22 },
        cabbage: { lv: 5, minutes: 60, seed: 45, yield: [2, 3], exp: 30 },
        tomato: { lv: 8, minutes: 90, seed: 70, yield: [2, 4], exp: 42 },
        pumpkin: { lv: 12, minutes: 150, seed: 120, yield: [1, 3], exp: 70 },
        strawberry: { lv: 16, minutes: 240, seed: 200, yield: [3, 5], exp: 110 }
    },
    recipes: {
        grilled_fish: { lv: 1, exp: 12, in: [{ id: "carp", qty: 1 }] },
        veggie_soup: { lv: 2, exp: 16, in: [{ id: "carrot", qty: 2 }, { id: "potato", qty: 1 }] },
        fish_stew: { lv: 4, exp: 24, in: [{ id: "carp", qty: 2 }, { id: "potato", qty: 1 }] },
        honey_cake: { lv: 5, exp: 28, in: [{ id: "honey", qty: 2 }, { id: "carrot", qty: 1 }] }
    },
    foodBuffs: {},
    tools: {
        rods: [{ id: "rod_1", lv: 1, price: 200 }, { id: "rod_2", lv: 5, price: 1500 }, { id: "rod_3", lv: 10, price: 6000 }, { id: "rod_4", lv: 15, price: 20000 }],
        picks: [{ id: "pick_1", lv: 1, price: 200 }, { id: "pick_2", lv: 5, price: 1500 }, { id: "pick_3", lv: 10, price: 6000 }, { id: "pick_4", lv: 15, price: 20000 }]
    },
    ores: {
        copper_ore: { lv: 1, hits: 3, exp: 8 },
        iron_ore: { lv: 5, hits: 4, exp: 14 },
        silver_ore: { lv: 9, hits: 5, exp: 22 },
        gold_ore: { lv: 13, hits: 6, exp: 34 },
        mithril_ore: { lv: 17, hits: 7, exp: 50 }
    },
    mineNodes: [],
    fishDefs: {
        carp: { spot: "lake", lv: 1, exp: 8 },
        perch: { spot: "lake", lv: 1, exp: 8 },
        catfish: { spot: "lake", lv: 4, exp: 12 },
        pike: { spot: "lake", lv: 7, exp: 35 },
        golden_carp: { spot: "lake", lv: 10, exp: 120 },
        trout: { spot: "stream", lv: 6, exp: 16 },
        salmon: { spot: "stream", lv: 8, exp: 18 },
        eel: { spot: "stream", lv: 10, exp: 45 },
        rainbow_trout: { spot: "cave", lv: 13, exp: 60 },
        cave_fish: { spot: "cave", lv: 12, exp: 24 },
        crystal_shrimp: { spot: "cave", lv: 15, exp: 70 },
        ghost_koi: { spot: "cave", lv: 18, exp: 220 }
    },
    homeTiers: [{ beds: 4, gold: 500000, gems: 2500 }, { beds: 6, gold: 1000000, gems: 0 }, { beds: 8, gold: 2000000, gems: 0 }],
    furn: {
        chair: { gold: 3000 }, stool: { gold: 2000 }, table: { gold: 6000 }, sofa: { gold: 15000 },
        bookshelf: { gold: 12000 }, wardrobe: { gold: 14000 }, plant: { gold: 4000 }, vase: { gold: 3500 },
        lamp: { gold: 5000 }, easel: { gold: 10000 }, fireplace: { gold: 30000 }, armor: { gold: 20000 },
        rug_blue: { gold: 5000, floor: true }, rug_red: { gold: 8000, floor: true }
    },
    shopLook: {},
    loginRewards: [
        { zeny: 1000, items: [] },
        { zeny: 0, items: [{ id: "potion_orange", qty: 10 }] },
        { zeny: 2000, items: [] },
        { zeny: 0, items: [{ id: "honey_cake", qty: 3 }] },
        { zeny: 3000, items: [] },
        { zeny: 0, items: [{ id: "potion_white", qty: 10 }] },
        { zeny: 5000, items: [{ id: "egg_mystery", qty: 1 }] }
    ],
    dailyTasks: {
        t_kill: { kind: "kill", n: 40 },
        t_fish: { kind: "fish", n: 5 },
        t_mine: { kind: "mine", n: 5 },
        t_cook: { kind: "cook", n: 3 },
        t_harvest: { kind: "harvest", n: 3 },
        t_feed: { kind: "feed", n: 1 },
        t_dungeon: { kind: "dungeon", n: 1, level: 15 },
        t_wb: { kind: "wb", n: 1, level: 10 },
        t_sell: { kind: "sell", n: 10 },
        t_refine: { kind: "refine", n: 1, level: 10 }
    },
    achievements: {}
};

// ============================================================================
// MEGA UPSTREAM GAME ENGINE LOADER (Maps, Quests, Skills, Gear, Drops)
// ============================================================================
let skillsDatabase = {};
let dropsDatabase = {};

try {
    const skillsPath = path.join(__dirname, "skills_extracted.json");
    if (fs.existsSync(skillsPath)) {
        skillsDatabase = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
        console.log(`[MEGA-DATA] Loaded ${Object.keys(skillsDatabase).length} skills into skillsDatabase!`);
    }
} catch (e) { console.warn("[MEGA-DATA] Error loading skills:", e); }

try {
    const questsPath = path.join(__dirname, "quests_extracted.json");
    if (fs.existsSync(questsPath)) {
        const fullQuests = JSON.parse(fs.readFileSync(questsPath, "utf8"));
        syncedExtras.quests = { ...fullQuests, ...syncedExtras.quests };
        console.log(`[MEGA-DATA] Loaded ${Object.keys(syncedExtras.quests).length} quests into syncedExtras.quests!`);
    }
} catch (e) { console.warn("[MEGA-DATA] Error loading quests:", e); }

try {
    const mapsPath = path.join(__dirname, "maps_extracted.json");
    if (fs.existsSync(mapsPath)) {
        const fullMaps = JSON.parse(fs.readFileSync(mapsPath, "utf8"));
        syncedMaps = { ...fullMaps, ...syncedMaps }; // Preserve custom aurum/bull1 if any
        console.log(`[MEGA-DATA] Loaded ${Object.keys(syncedMaps).length} maps into syncedMaps!`);
    }
} catch (e) { console.warn("[MEGA-DATA] Error loading maps:", e); }

try {
    const gearPath = path.join(__dirname, "gear_extracted.json");
    if (fs.existsSync(gearPath)) {
        const fullGear = JSON.parse(fs.readFileSync(gearPath, "utf8"));
        syncedExtras.gear = { ...fullGear, ...syncedExtras.gear };
        console.log(`[MEGA-DATA] Loaded ${Object.keys(syncedExtras.gear).length} gear items into syncedExtras.gear!`);
    }
} catch (e) { console.warn("[MEGA-DATA] Error loading gear:", e); }

try {
    const dropsPath = path.join(__dirname, "drops_extracted.json");
    if (fs.existsSync(dropsPath)) {
        dropsDatabase = JSON.parse(fs.readFileSync(dropsPath, "utf8"));
        console.log(`[MEGA-DATA] Loaded ${Object.keys(dropsDatabase).length} monsters into dropsDatabase!`);
    }
} catch (e) { console.warn("[MEGA-DATA] Error loading drops:", e); }

// Biome-based Monster Generator for 101 Maps
const BIOME_MONSTERS = {
    meadow: ["slime", "bunny", "bee", "frog", "bull", "silverstag"],
    forest: ["shroom", "crab", "woodling", "snake", "wolf", "bear", "spider", "owlbear"],
    swamp: ["frog", "crab", "snake", "leech", "wisp", "alligator"],
    mountain: ["goblin", "archer", "brute", "shaman", "ram", "eagle", "boar"],
    desert: ["mummy", "scorpion", "shard", "sandgolem", "gargoyle", "anubis"],
    cave: ["mole", "bat", "beetle", "skeleton", "zombie", "golem", "ghost", "wraith"],
    snow: ["yeti", "wolf_dire", "icegolem", "frost_wisp", "mammoth"],
    volcano: ["demon", "firegolem", "lava_beast", "dragon_hatchling", "cerberus", "archdemon"]
};

function getBiomeForMap(mapId) {
    if (mapId.includes("volcano") || mapId.includes("ember") || mapId.includes("dmn") || mapId.includes("inferno") || mapId.includes("demon") || mapId.includes("ash")) return "volcano";
    if (mapId.includes("frost") || mapId.includes("glacier") || mapId.includes("fjord") || mapId.includes("rime") || mapId.includes("summit") || mapId.includes("aurora")) return "snow";
    if (mapId.includes("mine") || mapId.includes("grotto") || mapId.includes("crypt") || mapId.includes("abbey") || mapId.includes("warren")) return "cave";
    if (mapId.includes("pyra") || mapId.includes("desert") || mapId.includes("dunes") || mapId.includes("canyon") || mapId.includes("mesa")) return "desert";
    if (mapId.includes("pass") || mapId.includes("cliffs") || mapId.includes("goblin") || mapId.includes("dryhills") || mapId.includes("spine")) return "mountain";
    if (mapId.includes("pip") || mapId.includes("marsh") || mapId.includes("bog") || mapId.includes("fungal") || mapId.includes("thornwood")) return "swamp";
    if (mapId.includes("bear") || mapId.includes("forest") || mapId.includes("eldergrove") || mapId.includes("soulwood")) return "forest";
    return "meadow";
}

function getMonsterStats(kind, level) {
    const lv = Math.max(1, level || 1);
    const hp = Math.round(55 + lv * 28 + Math.pow(lv, 1.42) * 6);
    const atk = Math.round(7 + lv * 2.9);
    const exp = Math.round(18 + lv * 18 + Math.pow(lv, 1.25) * 5);
    const coins = Math.max(4, Math.round(lv * 4.2));
    return { hp, atk, exp, coins, speed: 1.4, radius: 0.45, reach: 1.15 };
}

// Starter skills for each job class
const JOB_STARTER_SKILLS = {
    novice: { firstAid: 1 },
    swordsman: { bash: 1, magnumBreak: 1, provoke: 1, endure: 1, swordMastery: 1 },
    archer: { doubleStrafe: 1, arrowShower: 1, chargeArrow: 1, concentration: 1, owlEye: 1 },
    mage: { fireBolt: 1, coldBolt: 1, frostDiver: 1, thunderstorm: 1, mpRecovery: 1 },
    acolyte: { heal: 1, blessing: 1, increaseAgi: 1, holyLight: 1, divineProtection: 1 },
    thief: { doubleStab: 1, envenom: 1, smokeBomb: 1, shadowStep: 1, daggerMastery: 1 },
    merchant: { mammonite: 1, cartRevolution: 1, coinToss: 1, battleCry: 1, haggle: 1 },
    knight: { pierce: 1, bowlingBash: 1, spiralPierce: 1, twoHandQuicken: 1, knightMastery: 1 },
    hunter: { beastStrike: 1, trapBlast: 1, piercingShot: 1, wildCall: 1, beastBond: 1 },
    ninja: { shuriken: 1, kunaiRain: 1, fireJutsu: 1, shadowClone: 1, ninjutsu: 1 },
    blacksmith: { powerSmash: 1, hammerFall: 1, adrenalineRush: 1, weaponPerfection: 1, forgeMastery: 1 },
    alchemist: { acidTerror: 1, bombFlask: 1, potionPitcher: 1, aidPotion: 1, potionResearch: 1 },
    wizard: { meteorStorm: 1, stormGust: 1, jupitelThunder: 1, energyCoat: 1, wizardMastery: 1 },
    priest: { magnusExorcismus: 1, sanctuary: 1, kyrieEleison: 1, lexAeterna: 1, maceMastery: 1 }
};


function getDayStr(ts = Date.now()) {
    return new Date(ts + 25200000).toISOString().slice(0, 10);
}

function hashPassword(password, salt) {
    return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

function createStarterCharacter(accountId, slot = 0, name = "นักผจญภัย", lookCode = "") {
    const today = getDayStr();
    return {
        id: `${accountId}_char_${slot}`,
        uid: `${accountId}_char_${slot}`,
        slot: Number(slot) || 0,
        name: name || "นักผจญภัย",
        level: 1,
        exp: 0,
        job: "novice",
        style: 0,
        // Empty look triggers the authentic in-game 3D character creator on first join!
        look: lookCode || "",
        hp: 100,
        maxHp: 100,
        mp: 40,
        maxMp: 40,
        str: 0,
        vit: 0,
        agi: 0,
        int: 0,
        points: 0,
        map: "aurum",
        saveMap: "aurum",
        x: 0,
        z: 18,
        yaw: 0,
        gm: false,
        gmState: { hide: false, god: false, speed: 1 },
        ride: "",
        title: "",
        guild: "",
        zeny: 0,
        gems: 0,
        shopOwned: [],
        items: [
            { id: "potion_red", qty: 5 }
        ],
        gear: [
            { id: "gear_sword_1", item: "wooden_sword", slot: "weapon", refine: 0 }
        ],
        storageItems: [],
        storageGear: [],
        storageZeny: 0,
        marketListings: [],
        mailList: [],
        guildData: null,
        skills: {
            firstAid: 1
        },
        quests: {
            on: { m01: [0] },
            done: [],
            dailyDone: [],
            track: ["m01"]
        },
        life: {
            lv: { fish: 1, mine: 1, cook: 1, farm: 1 },
            exp: { fish: 0, mine: 0, cook: 0, farm: 0 },
            rod: 0,
            pick: 0,
            plots: [
                { crop: "", at: 0, water: false },
                { crop: "", at: 0, water: false }
            ],
            homePlots: [
                { crop: "", at: 0, water: false },
                { crop: "", at: 0, water: false },
                { crop: "", at: 0, water: false },
                { crop: "", at: 0, water: false }
            ],
            food: null,
            mount: null,
            home: 0,
            homeOpen: "friends",
            furn: {
                own: {},
                placed: []
            },
            pets: {
                pets: [],
                out: "",
                nest: null,
                pick: true,
                dex: [],
                pity: 0
            }
        },
        stats: {
            kills: 0,
            dun: 0,
            wbMvp: 0,
            towns: ["aurum"],
            login: { day: "", n: 0, total: 0 },
            daily: { day: today, ids: ["t_kill", "t_fish", "t_mine"], p: [0, 0, 0], bonus: false },
            ach: [],
            cnt: {},
            pass: { season: 1, pts: 0, free: [], prem: [], hasPrem: false },
            worn: { hat: "", back: "", face: "", costume: "", aura: "", trail: "", bird: "", name: "", pet: "" }
        },
        duels: { w: 0, l: 0 }
    };
}

let accountsDb = {
    users: {},    // usernameLower -> { id, username, salt, passwordHash, token, createdAt, gems, storageItems, storageGear, storageZeny, chars: { "0": charObj, "1": charObj, "2": charObj } }
    tokens: {},   // token -> usernameLower
    marketListings: [
        { id: "mkt_1", seller: "npc_1", sellerName: "พ่อค้าพเนจร", item: "potion_white", qty: 10, price: 1200 },
        { id: "mkt_2", seller: "npc_2", sellerName: "ช่างตีเหล็กหลวง", item: "iron_sword", qty: 1, price: 250, refine: 2 },
        { id: "mkt_3", seller: "npc_3", sellerName: "นักล่าสมบัติ", item: "egg_mystery", qty: 1, price: 7500 }
    ]
};

try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
        const loaded = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
        if (loaded && loaded.users) {
            accountsDb = { ...accountsDb, ...loaded };
        }
    }
} catch (e) {
    console.warn("Could not load accounts.json, starting fresh:", e.message);
}

function saveAccountsDb() {
    try {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountsDb, null, 2), "utf8");
    } catch (e) {
        console.error("Failed to save accounts.json:", e.message);
    }
}

function getAccountByToken(authHeaderOrToken) {
    if (!authHeaderOrToken) return null;
    const token = String(authHeaderOrToken).replace(/^Bearer\s+/i, "").trim();
    const uname = accountsDb.tokens[token];
    if (uname && accountsDb.users[uname]) {
        return accountsDb.users[uname];
    }
    return null;
}

function getOrCreateCharForAccount(account, slot = 0) {
    const sKey = String(Number(slot) || 0);
    if (!account.chars) account.chars = {};
    if (!account.chars[sKey]) {
        account.chars[sKey] = createStarterCharacter(account.id, Number(slot) || 0, account.username);
        saveAccountsDb();
    }
    const ch = account.chars[sKey];
    recalcStats(ch);
    return ch;
}

function expNeeded(lv) {
    const tj = 3.89 * Math.pow(1.08, Math.min(lv, 40));
    const tD = 30 * Math.pow(lv, 1.6);
    return Math.round(tD * tj);
}

function lifeExpNeeded(lv) {
    return Math.round(35 * Math.pow(lv, 1.45));
}

function addBagItem(prof, itemId, qty = 1) {
    if (!itemId || qty <= 0) return;
    itemId = resolveLootId(itemId);
    const existing = prof.items.find(i => i.id === itemId);
    if (existing) {
        existing.qty += qty;
    } else {
        prof.items.push({ id: itemId, qty });
    }
}

function removeBagItem(prof, itemId, qty = 1) {
    const idx = prof.items.findIndex(i => i.id === itemId);
    if (idx === -1) return false;
    if (prof.items[idx].qty < qty) return false;
    prof.items[idx].qty -= qty;
    if (prof.items[idx].qty <= 0) {
        prof.items.splice(idx, 1);
    }
    return true;
}

function recalcStats(p) {
    let bonusHp = 0;
    let bonusVit = 0;
    let bonusInt = 0;
    for (const g of (p.gear || [])) {
        if (!g.slot) continue;
        const gDef = syncedExtras.gear[g.item];
        if (gDef && gDef.add) {
            bonusHp += gDef.add.hp || 0;
            bonusVit += gDef.add.vit || 0;
            bonusInt += gDef.add.int || 0;
        }
        if (g.slot === "accessory") bonusHp += 5 * (g.refine || 0);
    }

    // Job Class Scaling Rebalance:
    // Thief (จอมโจร) & Ninja (นินจา) -> 2x Buff (เก่งขึ้น 2 เท่า)
    // Swordsman (นักดาบ) & Knight (อัศวิน) -> 0.5x Nerf (อ่อนแอลง 2 เท่า)
    const job = (p.job || "novice").toLowerCase();
    let hpJobMult = 1.0;
    let mpJobMult = 1.0;

    if (["thief", "ninja", "assassin", "kagerou", "shinkiro"].includes(job)) {
        hpJobMult = 1.8; // High survivability
        mpJobMult = 2.0; // 2x MP pool for skill spamming
    } else if (["swordsman", "knight", "runeknight", "dragonknight"].includes(job)) {
        hpJobMult = 0.5; // Halved HP growth (2x weaker)
        mpJobMult = 0.6; // Reduced MP
    }

    p.maxHp = Math.round((100 + (p.level * 25) + ((p.vit + bonusVit) * 18) + bonusHp) * hpJobMult);
    p.maxMp = Math.round((40 + (p.level * 8) + ((p.int + bonusInt) * 12)) * mpJobMult);
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    if (p.mp > p.maxMp) p.mp = p.maxMp;
}

// ============================================================================
// Quest & Daily Task & Achievement Progression Helpers
// ============================================================================
function progressQuestGoal(prof, socket, goalCheckFn) {
    let changed = false;
    const onQuests = prof.quests.on || {};
    for (const [qId, counts] of Object.entries(onQuests)) {
        const qDef = syncedExtras.quests[qId];
        if (!qDef || !Array.isArray(qDef.goals)) continue;
        qDef.goals.forEach((g, idx) => {
            const add = goalCheckFn(g);
            if (add > 0) {
                const maxN = g.n || 1;
                const prev = counts[idx] || 0;
                if (prev < maxN) {
                    counts[idx] = Math.min(maxN, prev + add);
                    changed = true;
                }
            }
        });
    }
    if (changed && socket) {
        sendJson(socket, { t: "msg", type: "quests", data: prof.quests });
    }
}

function progressDailyAndAchievements(prof, socket, kind, amount = 1) {
    if (!prof.stats.cnt) prof.stats.cnt = {};
    prof.stats.cnt[kind] = (prof.stats.cnt[kind] || 0) + amount;

    const daily = prof.stats.daily;
    if (daily && Array.isArray(daily.ids)) {
        let taskCompleted = false;
        daily.ids.forEach((tId, idx) => {
            const tDef = syncedExtras.dailyTasks[tId];
            if (tDef && tDef.kind === kind) {
                const prev = daily.p[idx] || 0;
                if (prev < tDef.n) {
                    daily.p[idx] = Math.min(tDef.n, prev + amount);
                    if (daily.p[idx] >= tDef.n) {
                        taskCompleted = true;
                        prof.zeny += 500;
                        prof.stats.pass.pts = (prof.stats.pass.pts || 0) + 50;
                    }
                }
            }
        });
        if (taskCompleted) {
            const allDone = daily.ids.every((tId, idx) => {
                const tDef = syncedExtras.dailyTasks[tId];
                return tDef && (daily.p[idx] || 0) >= tDef.n;
            });
            if (allDone && !daily.bonus) {
                daily.bonus = true;
                prof.zeny += 2000;
                prof.gems += 25;
                if (socket) sendJson(socket, { t: "msg", type: "shop", data: { gems: prof.gems, owned: prof.shopOwned } });
            }
            if (socket) {
                sendJson(socket, { t: "msg", type: "dailyDone", data: { all: allDone } });
                sendJson(socket, { t: "msg", type: "wallet", data: { zeny: prof.zeny } });
            }
        }
    }

    const achList = prof.stats.ach || [];
    for (const [achId, achDef] of Object.entries(syncedExtras.achievements || {})) {
        if (achList.includes(achId)) continue;
        let val = 0;
        if (achDef.group === "level") val = prof.level;
        else if (achDef.group === "hunt") val = prof.stats.kills || 0;
        else if (achDef.group === "dungeon") val = prof.stats.dun || 0;
        else if (achDef.group === "boss") val = prof.stats.wbMvp || 0;
        else if (achId.startsWith("fish")) val = prof.stats.cnt.fish || 0;
        else if (achId.startsWith("mine")) val = prof.stats.cnt.mine || 0;
        else if (achId.startsWith("cook")) val = prof.stats.cnt.cook || 0;
        else if (achId.startsWith("farm")) val = prof.stats.cnt.harvest || 0;
        else if (achId.startsWith("refine")) val = prof.stats.cnt.refine || 0;
        else if (achId.startsWith("login")) val = prof.stats.login?.total || 0;
        else if (achId === "quests50") val = prof.quests.done?.length || 0;
        else if (achId === "towns5") val = prof.stats.towns?.length || 0;
        if (val >= (achDef.need || 1)) {
            achList.push(achId);
            prof.zeny += achDef.zeny || 1000;
            if (socket) {
                sendJson(socket, { t: "msg", type: "achieved", data: { id: achId, zeny: achDef.zeny || 1000 } });
                sendJson(socket, { t: "msg", type: "wallet", data: { zeny: prof.zeny } });
            }
        }
    }
}

function addLifeExp(prof, room, sid, socket, skill, expGain) {
    if (!prof.life.lv) prof.life.lv = { fish: 1, mine: 1, cook: 1, farm: 1 };
    if (!prof.life.exp) prof.life.exp = { fish: 0, mine: 0, cook: 0, farm: 0 };
    prof.life.exp[skill] = (prof.life.exp[skill] || 0) + expGain;
    let lv = prof.life.lv[skill] || 1;
    let leveled = false;
    while (lv < 20 && prof.life.exp[skill] >= lifeExpNeeded(lv)) {
        prof.life.exp[skill] -= lifeExpNeeded(lv);
        lv += 1;
        prof.life.lv[skill] = lv;
        leveled = true;
    }
    if (leveled && room) {
        broadcastRoom(room, { t: "msg", type: "lifeUp", data: { sid, skill, lv } });
    }
}

// ============================================================================
// Active Rooms & Monster Simulation per Map
// ============================================================================
const roomsByMap = new Map();
const sessionProfiles = new Map(); // sessionId -> playerProfile reference
const sessionSockets = new Map(); // sessionId -> ws
const sessionRooms = new Map(); // sessionId -> room
const sessionUids = new Map(); // sessionId -> uid
const uidSessions = new Map(); // uid -> sessionId
const parties = new Map(); // partyId -> { id, leader, even, members: [...] }
const playerParties = new Map(); // uid -> partyId

function buildPartyMember(profile) {
    return {
        uid: profile.uid,
        name: profile.name,
        level: profile.level || 1,
        hp: profile.hp || 100,
        maxHp: profile.maxHp || 100,
        map: profile.map || "aurum",
        ch: 1,
        on: true,
        down: (profile.hp || 100) <= 0
    };
}

function syncPartyToMembers(party) {
    if (!party) return;
    for (const m of party.members) {
        const sid = uidSessions.get(m.uid);
        if (sid && sessionSockets.has(sid)) {
            sendJson(sessionSockets.get(sid), { t: "msg", type: "party", data: party });
        }
    }
}

function sendPartyInfoToMembers(party, info) {
    if (!party) return;
    for (const m of party.members) {
        const sid = uidSessions.get(m.uid);
        if (sid && sessionSockets.has(sid)) {
            sendJson(sessionSockets.get(sid), { t: "msg", type: "partyInfo", data: info });
        }
    }
}

function updatePartyMemberStats(playerProfile) {
    if (!playerProfile || !playerProfile.uid) return;
    const partyId = playerParties.get(playerProfile.uid);
    if (!partyId || !parties.has(partyId)) return;
    const party = parties.get(partyId);
    const m = party.members.find(x => x.uid === playerProfile.uid);
    if (m) {
        let changed = false;
        if (m.hp !== playerProfile.hp) { m.hp = playerProfile.hp; changed = true; }
        if (m.maxHp !== playerProfile.maxHp) { m.maxHp = playerProfile.maxHp; changed = true; }
        if (m.level !== playerProfile.level) { m.level = playerProfile.level; changed = true; }
        if (m.map !== playerProfile.map) { m.map = playerProfile.map; changed = true; }
        const isDown = (playerProfile.hp || 0) <= 0;
        if (m.down !== isDown) { m.down = isDown; changed = true; }
        if (changed) {
            syncPartyToMembers(party);
        }
    }
}
let dropSeq = 1;
let gearSeq = 100;

function getOrCreateMapRoom(mapId) {
    if (!syncedMaps[mapId]) {
        syncedMaps[mapId] = {
            id: mapId,
            kind: "field",
            start: { x: 0, z: 0, yaw: 0 },
            warps: [],
            spawns: []
        };
    }
    if (roomsByMap.has(mapId)) return roomsByMap.get(mapId);

    const mapDef = syncedMaps[mapId];
    const room = {
        mapId,
        roomId: "room_" + mapId,
        clients: new Map(), // sessionId -> ws
        players: new Map(), // sessionId -> playerState
        monsters: new Map(), // monId -> monState
        drops: new Map(), // dropId -> dropState
        usedNodes: {},
        strikeCounts: {},
        spawnedFromDef: false
    };

    populateMonstersForRoom(room, mapDef);
    roomsByMap.set(mapId, room);
    return room;
}

function populateMonstersForRoom(room, mapDef) {
    if (!mapDef || mapDef.kind === "town") return;
    room.monsters.clear();
    let idx = 1;

    let spawnsList = Array.isArray(mapDef.spawns) && mapDef.spawns.length > 0 ? [...mapDef.spawns] : [];
    if (spawnsList.length === 0) {
        // Procedurally generate authentic spawns based on biome & level for all 101 maps
        const biome = getBiomeForMap(room.mapId);
        const candidates = BIOME_MONSTERS[biome] || BIOME_MONSTERS.meadow;
        const [lvMin, lvMax] = mapDef.lv || [1, 5];
        
        const clusters = [
            { x: -35, z: -35, r: 12 },
            { x: 35, z: -35, r: 12 },
            { x: -35, z: 35, r: 12 },
            { x: 35, z: 35, r: 12 },
            { x: 0, z: 0, r: 15 }
        ];

        clusters.forEach((cl, cIdx) => {
            const mKind = candidates[cIdx % candidates.length];
            spawnsList.push({
                kind: mKind,
                x: cl.x,
                z: cl.z,
                r: cl.r,
                n: 4,
                levels: [lvMin, lvMax],
                variant: 0
            });
        });
    }

    for (const sp of spawnsList) {
        const count = Math.min(sp.n || 4, 12);
        const lvMin = sp.levels ? sp.levels[0] : 1;
        const lvMax = sp.levels ? sp.levels[1] : lvMin;
        const mInfo = syncedMonsters[sp.kind] || { hp: 60 + lvMin * 25, atk: 8 + lvMin * 3, exp: 15 + lvMin * 8 };
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * (sp.r || 6);
            const mx = +(sp.x + Math.cos(angle) * dist).toFixed(2);
            const mz = +(sp.z + Math.sin(angle) * dist).toFixed(2);
            const lv = lvMin + Math.floor(Math.random() * (lvMax - lvMin + 1));
            const maxHp = Math.round((mInfo.hp || (50 + lv * 22)));
            const monId = `m_${idx++}`;
            room.monsters.set(monId, {
                id: monId,
                kind: sp.kind,
                level: lv,
                x: mx,
                z: mz,
                spawnX: sp.x,
                spawnZ: sp.z,
                spawnR: sp.r || 7,
                yaw: +(Math.random() * Math.PI * 2).toFixed(2),
                hp: maxHp,
                maxHp: maxHp,
                mode: "idle",
                variant: sp.variant || 0,
                elite: false,
                lunge: 0,
                fx: 0,
                targetSid: null,
                deadAt: 0,
                nextMoveAt: Date.now() + 1000 + Math.random() * 3000,
                lastAttackAt: 0
            });
        }
    }
    room.spawnedFromDef = true;
}

// ============================================================================
// WebSocket Framing Helpers (RFC 6455)
// ============================================================================
function sendWsText(socket, text) {
    if (!socket || socket.destroyed || !socket.writable) return;
    const payload = Buffer.from(text, "utf8");
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = len;
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
        socket.write(Buffer.concat([header, payload]));
    } catch (e) {}
}

function sendJson(socket, obj) {
    sendWsText(socket, JSON.stringify(obj));
}

function broadcastRoom(room, obj, exceptSid = null) {
    const str = JSON.stringify(obj);
    for (const [sid, sock] of room.clients.entries()) {
        if (exceptSid && sid === exceptSid) continue;
        sendWsText(sock, str);
    }
}

function parseWsFrames(buffer, onFrame) {
    let offset = 0;
    while (offset + 2 <= buffer.length) {
        const byte0 = buffer[offset];
        const byte1 = buffer[offset + 1];
        const opcode = byte0 & 0x0f;
        const isMasked = (byte1 & 0x80) !== 0;
        let payloadLen = byte1 & 0x7f;
        let headerLen = 2;

        if (payloadLen === 126) {
            if (offset + 4 > buffer.length) break;
            payloadLen = buffer.readUInt16BE(offset + 2);
            headerLen = 4;
        } else if (payloadLen === 127) {
            if (offset + 10 > buffer.length) break;
            payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
            headerLen = 10;
        }

        const maskLen = isMasked ? 4 : 0;
        const totalFrameLen = headerLen + maskLen + payloadLen;
        if (offset + totalFrameLen > buffer.length) break;

        let payload = buffer.subarray(offset + headerLen + maskLen, offset + totalFrameLen);
        if (isMasked) {
            const mask = buffer.subarray(offset + headerLen, offset + headerLen + 4);
            const unmasked = Buffer.alloc(payloadLen);
            for (let i = 0; i < payloadLen; i++) {
                unmasked[i] = payload[i] ^ mask[i & 3];
            }
            payload = unmasked;
        }

        onFrame(opcode, payload);
        offset += totalFrameLen;
    }
    return buffer.subarray(offset);
}

// ============================================================================
// Client Message Processing (Per-Account & Per-Character)
// ============================================================================
function buildCharPayload(prof) {
    return {
        uid: prof.uid,
        name: prof.name,
        level: prof.level,
        exp: prof.exp,
        job: prof.job,
        style: prof.style,
        look: prof.look,
        str: prof.str,
        vit: prof.vit,
        agi: prof.agi,
        int: prof.int,
        points: prof.points,
        skills: prof.skills,
        quests: prof.quests,
        life: prof.life,
        stats: prof.stats,
        duels: prof.duels || { w: 0, l: 0 }
    };
}

function formatWornGearString(prof) {
    return (prof.gear || [])
        .filter(g => g.slot)
        .map(g => `${g.slot}:${g.item}:${g.refine || 0}`)
        .join(",");
}

function buildPlayerEntity(prof) {
    const worn = prof.stats?.worn || {};
    const outPetId = prof.life?.pets?.out;
    const outPet = (prof.life?.pets?.pets || []).find(pt => pt.id === outPetId);
    return {
        uid: prof.uid,
        name: prof.name,
        x: prof.x,
        z: prof.z,
        yaw: prof.yaw,
        speed: 0,
        hp: prof.hp,
        maxHp: prof.maxHp,
        mp: prof.mp,
        maxMp: prof.maxMp,
        level: prof.level,
        job: prof.job,
        style: prof.style,
        look: prof.look || "c2.0.0.0.0.0.0.0",
        gear: formatWornGearString(prof),
        ride: prof.ride || "",
        atk: 0,
        gm: !!prof.gm,
        guild: prof.guildData?.name || prof.guild || "",
        emblem: prof.guildData?.emblem || "0.0.5.2",
        title: prof.title || "",
        cos: `${worn.name || ""}|${worn.pet || ""}`,
        pet: outPet ? outPet.species : "",
        petShiny: outPet ? !!outPet.shiny : false,
        petName: outPet ? (outPet.name || "") : "",
        act: "",
        sit: false,
        lie: false,
        down: false,
        cast: false,
        hide: false,
        fx: 0,
        buff: 0
    };
}

function syncPlayerGearAndStats(prof, room, sid, socket) {
    recalcStats(prof);
    const p = room.players.get(sid);
    if (p) {
        p.gear = formatWornGearString(prof);
        p.maxHp = prof.maxHp;
        p.maxMp = prof.maxMp;
        p.hp = prof.hp;
        p.mp = prof.mp;
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
    }
    sendJson(socket, { t: "msg", type: "gear", data: prof.gear });
    sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(prof) });
    sendJson(socket, { t: "msg", type: "bag", data: { zeny: prof.zeny, items: prof.items } });
    saveAccountsDb();
}

function handleClientAction(room, sid, socket, type, data = {}) {
    const p = room.players.get(sid);
    const playerProfile = sessionProfiles.get(sid);
    if (!p || !playerProfile) return;

    const saveProfile = saveAccountsDb;

    // 1. Movement & Portal Warps
    if (type === "move") {
        if (typeof data.x === "number" && typeof data.z === "number") {
            p.x = data.x;
            p.z = data.z;
            p.yaw = data.yaw || 0;
            p.speed = data.speed || 0;
            p.sit = false;
            p.lie = false;
            playerProfile.x = p.x;
            playerProfile.z = p.z;
            playerProfile.yaw = p.yaw;

            // Broadcast real-time player position, facing yaw & speed to all other players in this room!
            broadcastRoom(room, {
                t: "patch",
                players: {
                    [sid]: {
                        x: p.x,
                        z: p.z,
                        yaw: p.yaw,
                        speed: p.speed,
                        sit: false,
                        lie: false
                    }
                }
            }, sid);

            const mapDef = syncedMaps[room.mapId];
            if (mapDef && Array.isArray(mapDef.warps)) {
                for (const w of mapDef.warps) {
                    if (Math.hypot(p.x - w.x, p.z - w.z) <= 2.2 && w.to) {
                        const destMap = syncedMaps[w.to];
                        let outPos = { x: 0, z: 0, yaw: 0 };
                        if (destMap && Array.isArray(destMap.warps)) {
                            const entryWarp = destMap.warps.find(dw => dw.id === w.via || dw.to === room.mapId);
                            if (entryWarp && entryWarp.out) {
                                outPos = entryWarp.out;
                            } else if (destMap.start) {
                                outPos = destMap.start;
                            }
                        }
                        playerProfile.map = w.to;
                        playerProfile.x = outPos.x;
                        playerProfile.z = outPos.z;
                        playerProfile.yaw = outPos.yaw || 0;
                        if (destMap?.kind === "town" && !playerProfile.stats.towns.includes(w.to)) {
                            playerProfile.stats.towns.push(w.to);
                        }
                        progressQuestGoal(playerProfile, socket, g => (g.kind === "visit" && g.map === w.to ? 1 : 0));
                        saveProfile();
                        sendJson(socket, { t: "msg", type: "warp", data: { map: w.to, roomId: "room_" + w.to } });
                        return;
                    }
                }
            }
        }
        return;
    }

    // 2. Combat, Skills, Monster Kills & Loot Drops
    if (type === "attack" || type === "skill") {
        if (typeof data.yaw === "number") p.yaw = data.yaw;
        p.atk = (p.atk || 0) + 1;

        const isSkill = type === "skill";
        const skillId = data.id || "bash";
        const sDef = skillsDatabase[skillId] || null;
        const skillLv = playerProfile.skills ? (playerProfile.skills[skillId] || 1) : 1;

        if (isSkill) {
            const mpCost = sDef && Array.isArray(sDef.mp) ? (sDef.mp[skillLv - 1] ?? sDef.mp[0]) : 6;
            if (p.mp < mpCost) {
                sendJson(socket, { t: "msg", type: "skillFail", data: { reason: "no_mp" } });
                return;
            }
            p.mp = Math.max(0, p.mp - mpCost);
            playerProfile.mp = p.mp;
            broadcastRoom(room, { t: "msg", type: "skill", data: { sid, id: skillId, x: p.x, z: p.z, yaw: p.yaw, target: data.target, ms: sDef?.cooldownMs || 800 } });

            // Heals & Restoration Skills
            if (skillId === "firstAid" || skillId === "heal" || skillId === "sanctuary" || skillId === "highness" || skillId === "aidPotion") {
                const healAmt = Math.round(40 + playerProfile.int * 12 + playerProfile.level * 5 * (skillLv * 0.4 + 0.6));
                p.hp = Math.min(p.maxHp, p.hp + healAmt);
                playerProfile.hp = p.hp;
                broadcastRoom(room, { t: "msg", type: "healed", data: { sid, n: healAmt } });
                broadcastRoom(room, { t: "patch", players: { [sid]: p } });
                saveProfile();
                return;
            }

            // Party & Self Buffs
            if (["endure", "blessing", "increaseAgi", "concentration", "twoHandQuicken", "adrenalineRush", "weaponPerfection", "energyCoat", "kyrieEleison", "unlimit", "windSign", "battleCry"].includes(skillId)) {
                const buffSecs = sDef && Array.isArray(sDef.secs) ? (sDef.secs[skillLv - 1] ?? 60) : 60;
                broadcastRoom(room, { t: "msg", type: "buffed", data: { id: skillId, by: sid, sids: [sid], secs: buffSecs } });
                broadcastRoom(room, { t: "patch", players: { [sid]: p } });
                saveProfile();
                return;
            }
        }

        const targets = [];
        if (data.target && room.monsters.has(data.target)) {
            const m = room.monsters.get(data.target);
            if (m.mode !== "dead") targets.push(m);
        } else {
            for (const m of room.monsters.values()) {
                if (m.mode === "dead") continue;
                if (Math.hypot(m.x - p.x, m.z - p.z) <= (isSkill ? 5.0 : 3.5)) {
                    targets.push(m);
                    if (!isSkill) break;
                }
            }
        }

        let gearAtk = 0;
        for (const g of playerProfile.gear) {
            if (!g.slot) continue;
            const gd = syncedExtras.gear[g.item];
            if (gd?.add?.atk) gearAtk += gd.add.atk + (g.refine || 0) * 3;
            if (gd?.add?.matk) gearAtk += gd.add.matk + (g.refine || 0) * 3;
        }
        // Job Class Rebalance:
        // Thief / Ninja -> 2.0x Damage, +35% Crit Rate, 2.5x Crit Damage!
        // Swordsman / Knight -> 0.5x Damage (2x weaker), 5% Crit Rate, 1.25x Crit Damage!
        const playerJob = (playerProfile.job || "novice").toLowerCase();
        let jobAtkMult = 1.0;
        let jobCritRate = 0.12 + playerProfile.agi * 0.005;
        let jobCritMultiplier = 1.65;

        if (["thief", "ninja", "assassin", "kagerou", "shinkiro"].includes(playerJob)) {
            jobAtkMult = 2.0; // 2x Attack & Skill Multiplier!
            jobCritRate = 0.35 + playerProfile.agi * 0.015; // Up to 75%+ Crit Rate
            jobCritMultiplier = 2.50; // 2.5x Critical Burst Damage!
        } else if (["swordsman", "knight", "runeknight", "dragonknight"].includes(playerJob)) {
            jobAtkMult = 0.5; // 0.5x Attack & Skill Multiplier (2x weaker)
            jobCritRate = 0.05; // 5% flat crit rate
            jobCritMultiplier = 1.25; // 1.25x weak crit
        }

        const rawBaseAtk = 16 + playerProfile.str * 4 + playerProfile.int * 3 + playerProfile.agi * 2 + playerProfile.level * 3 + gearAtk;
        const baseAtk = Math.max(1, Math.round(rawBaseAtk * jobAtkMult));
        let skillPower = 1.0;
        let skillHits = 1;
        if (isSkill && sDef) {
            skillPower = Array.isArray(sDef.power) ? (sDef.power[skillLv - 1] ?? sDef.power[0]) : 2.0;
            skillHits = Array.isArray(sDef.hits) ? (sDef.hits[skillLv - 1] ?? 1) : 1;
        } else if (isSkill) {
            skillPower = 2.2;
        }

        const patchedMonsters = {};

        for (const m of targets) {
            const crit = Math.random() < jobCritRate;
            const singleHitDmg = Math.max(1, Math.round((baseAtk * skillPower * (0.9 + Math.random() * 0.25) * (crit ? jobCritMultiplier : 1)) / skillHits));
            const totalDmg = singleHitDmg * skillHits;
            const dmg = totalDmg;
            m.hp = Math.max(0, m.hp - dmg);
            m.targetSid = sid;
            if (m.mode === "idle" || m.mode === "walk") m.mode = "chase";

            broadcastRoom(room, {
                t: "msg",
                type: "hit",
                data: { id: m.id, by: sid, dmg, crit, w: isSkill ? skillId : "sword" }
            });

            if (m.hp <= 0) {
                m.mode = "dead";
                m.deadAt = Date.now();
                m.targetSid = null;

                const mInfo = syncedMonsters[m.kind] || {};
                const baseExp = mInfo.exp || (25 + m.level * 15);
                const partyId = playerParties.get(playerProfile.uid);
                const party = partyId ? parties.get(partyId) : null;

                if (party && party.even) {
                    const eligibleMembers = party.members.filter(mem => mem.on && mem.map === room.mapId);
                    const levels = eligibleMembers.map(mem => mem.level || 1);
                    const gap = levels.length > 1 && (Math.max(...levels) - Math.min(...levels)) > 15;

                    if (!gap && eligibleMembers.length > 1) {
                        const expPerMember = Math.max(1, Math.round(baseExp / eligibleMembers.length));
                        for (const mem of eligibleMembers) {
                            const memSid = uidSessions.get(mem.uid);
                            const memSocket = memSid ? sessionSockets.get(memSid) : null;
                            const memProfile = memSid ? sessionProfiles.get(memSid) : null;
                            if (memProfile && memSocket) {
                                memProfile.exp += expPerMember;
                                sendJson(memSocket, { t: "msg", type: "exp", data: { n: expPerMember } });
                                let memLeveled = false;
                                while (memProfile.exp >= expNeeded(memProfile.level)) {
                                    memProfile.exp -= expNeeded(memProfile.level);
                                    memProfile.level += 1;
                                    memProfile.points += 5;
                                    recalcStats(memProfile);
                                    memLeveled = true;
                                }
                                if (memLeveled) {
                                    const memRoom = sessionRooms.get(memSid) || room;
                                    const memP = memRoom.players.get(memSid);
                                    if (memP) {
                                        memP.level = memProfile.level;
                                        memP.maxHp = memProfile.maxHp;
                                        memP.maxMp = memProfile.maxMp;
                                    }
                                    broadcastRoom(memRoom, { t: "msg", type: "levelUp", data: { sid: memSid, level: memProfile.level } });
                                    sendJson(memSocket, { t: "msg", type: "char", data: buildCharPayload(memProfile) });
                                }
                                updatePartyMemberStats(memProfile);
                            }
                        }
                    } else {
                        playerProfile.exp += baseExp;
                        sendJson(socket, { t: "msg", type: "exp", data: { n: baseExp } });
                        let leveled = false;
                        while (playerProfile.exp >= expNeeded(playerProfile.level)) {
                            playerProfile.exp -= expNeeded(playerProfile.level);
                            playerProfile.level += 1;
                            playerProfile.points += 5;
                            recalcStats(playerProfile);
                            p.level = playerProfile.level;
                            p.maxHp = playerProfile.maxHp;
                            p.maxMp = playerProfile.maxMp;
                            p.hp = p.maxHp;
                            p.mp = p.maxMp;
                            leveled = true;
                        }
                        if (leveled) {
                            broadcastRoom(room, { t: "msg", type: "levelUp", data: { sid, level: playerProfile.level } });
                            progressQuestGoal(playerProfile, socket, g => (g.kind === "level" && playerProfile.level >= g.n ? g.n : 0));
                            progressDailyAndAchievements(playerProfile, socket, "level", 0);
                        }
                        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
                        updatePartyMemberStats(playerProfile);
                    }
                } else {
                    playerProfile.exp += baseExp;
                    sendJson(socket, { t: "msg", type: "exp", data: { n: baseExp } });
                    let leveled = false;
                    while (playerProfile.exp >= expNeeded(playerProfile.level)) {
                        playerProfile.exp -= expNeeded(playerProfile.level);
                        playerProfile.level += 1;
                        playerProfile.points += 5;
                        recalcStats(playerProfile);
                        p.level = playerProfile.level;
                        p.maxHp = playerProfile.maxHp;
                        p.maxMp = playerProfile.maxMp;
                        p.hp = p.maxHp;
                        p.mp = p.maxMp;
                        leveled = true;
                    }
                    if (leveled) {
                        broadcastRoom(room, { t: "msg", type: "levelUp", data: { sid, level: playerProfile.level } });
                        progressQuestGoal(playerProfile, socket, g => (g.kind === "level" && playerProfile.level >= g.n ? g.n : 0));
                        progressDailyAndAchievements(playerProfile, socket, "level", 0);
                    }
                    sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
                    updatePartyMemberStats(playerProfile);
                }

                playerProfile.stats.kills = (playerProfile.stats.kills || 0) + 1;
                if (mInfo.boss) {
                    playerProfile.stats.wbMvp = (playerProfile.stats.wbMvp || 0) + 1;
                }
                progressQuestGoal(playerProfile, socket, g => (g.kind === "kill" && Array.isArray(g.monsters) && g.monsters.includes(m.kind) ? 1 : 0));
                // Party Shared Kill Progression
                if (party) {
                    for (const mem of party.members) {
                        if (mem.uid !== playerProfile.uid && mem.on && mem.map === room.mapId) {
                            const memSid = uidSessions.get(mem.uid);
                            const memProfile = memSid ? sessionProfiles.get(memSid) : null;
                            const memSocket = memSid ? sessionSockets.get(memSid) : null;
                            if (memProfile && memSocket) {
                                progressQuestGoal(memProfile, memSocket, g => (g.kind === "kill" && Array.isArray(g.monsters) && g.monsters.includes(m.kind) ? 1 : 0));
                            }
                        }
                    }
                }
                progressDailyAndAchievements(playerProfile, socket, "kill", 1);

                // Share quest kill progression with party members on the same map
                if (party) {
                    for (const mem of party.members) {
                        if (mem.uid === playerProfile.uid || !mem.on || mem.map !== room.mapId) continue;
                        const memSid = uidSessions.get(mem.uid);
                        const memSocket = memSid ? sessionSockets.get(memSid) : null;
                        const memProfile = memSid ? sessionProfiles.get(memSid) : null;
                        if (memProfile && memSocket) {
                            memProfile.stats.kills = (memProfile.stats.kills || 0) + 1;
                            progressQuestGoal(memProfile, memSocket, g => (g.kind === "kill" && Array.isArray(g.monsters) && g.monsters.includes(m.kind) ? 1 : 0));
                            progressDailyAndAchievements(memProfile, memSocket, "kill", 1);
                        }
                    }
                }

                const dropId1 = `d_${dropSeq++}`;
                const mDropTable = syncedExtras.drops?.[m.kind];
                const coinRange = mDropTable?.coins || [Math.round(15 + m.level * 8), Math.round(25 + m.level * 12)];
                const coinQty = mInfo.coins || (Array.isArray(coinRange) ? Math.floor(coinRange[0] + Math.random() * (coinRange[1] - coinRange[0] + 1)) : 15);
                const drop1 = { id: dropId1, item: "coin", qty: coinQty, x: +(m.x + (Math.random() - 0.5) * 0.8).toFixed(2), z: +(m.z + (Math.random() - 0.5) * 0.8).toFixed(2), owner: p.uid, createdAt: Date.now() };
                room.drops.set(dropId1, drop1);
                const newDrops = { [dropId1]: drop1 };

                if (mDropTable && Array.isArray(mDropTable.items)) {
                    for (const dEntry of mDropTable.items) {
                        const chance = Math.min(1.0, (dEntry.chance || 0.1) * 2.2);
                        if (Math.random() < chance) {
                            const dId = `d_${dropSeq++}`;
                            const realItem = resolveLootId(dEntry.id, m.kind);
                            const dObj = { id: dId, item: realItem, qty: 1, x: +(m.x + (Math.random() - 0.5) * 0.9).toFixed(2), z: +(m.z + (Math.random() - 0.5) * 0.9).toFixed(2), owner: p.uid, createdAt: Date.now() };
                            room.drops.set(dId, dObj);
                            newDrops[dId] = dObj;
                        }
                    }
                } else {
                    const fallbackMap = { slime: "jelly_green", bunny: "bunny_fur", shroom: "shroom_cap", bee: "honey", goblin: "goblin_tooth", wolf: "wolf_pelt", frog: "frog_leg", crab: "crab_shell" };
                    const lootItem = fallbackMap[m.kind] || "jelly_green";
                    const dId = `d_${dropSeq++}`;
                    const dObj = { id: dId, item: lootItem, qty: 1, x: +(m.x + (Math.random() - 0.5) * 0.9).toFixed(2), z: +(m.z + (Math.random() - 0.5) * 0.9).toFixed(2), owner: p.uid, createdAt: Date.now() };
                    room.drops.set(dId, dObj);
                    newDrops[dId] = dObj;
                }
                broadcastRoom(room, { t: "patch", drops: newDrops });
                saveProfile();
            }
            patchedMonsters[m.id] = m;
        }

        broadcastRoom(room, { t: "patch", players: { [sid]: p }, monsters: patchedMonsters });
        return;
    }

    // 3. Daily Login, Daily Tasks & Achievements
    if (type === "loginClaim") {
        const today = getDayStr();
        const login = playerProfile.stats.login || { day: "", n: 0, total: 0 };
        if (login.day === today) {
            sendJson(socket, { t: "msg", type: "shopFail", data: { reason: "unavailable" } });
            return;
        }
        const rewards = syncedExtras.loginRewards || [];
        const nextN = (login.n % Math.max(1, rewards.length)) + 1;
        const reward = rewards[nextN - 1] || { zeny: 1000, items: [] };

        playerProfile.stats.login = {
            day: today,
            n: nextN,
            total: (login.total || 0) + 1
        };
        if (reward.zeny) playerProfile.zeny += reward.zeny;
        for (const it of (reward.items || [])) {
            addBagItem(playerProfile, it.id, it.qty || 1);
        }
        progressDailyAndAchievements(playerProfile, socket, "login", 0);
        saveProfile();

        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "login", n: nextN } });
        return;
    }

    if (type === "dailyLook") {
        const today = getDayStr();
        if (!playerProfile.stats.daily || playerProfile.stats.daily.day !== today) {
            playerProfile.stats.daily = {
                day: today,
                ids: ["t_kill", "t_fish", "t_mine"],
                p: [0, 0, 0],
                bonus: false
            };
            saveProfile();
        }
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        return;
    }

    if (type === "title") {
        const titleId = data.id || "";
        playerProfile.title = titleId;
        if (!playerProfile.stats.worn) playerProfile.stats.worn = {};
        playerProfile.stats.worn.title = titleId;
        p.title = titleId;
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    // 4. Quests & NPC Dialogs
    if (type === "questTalk") {
        const npc = data.npc;
        if (npc) {
            progressQuestGoal(playerProfile, socket, g => (g.kind === "talk" && g.npc === npc ? 1 : 0));
            saveProfile();
        }
        return;
    }

    if (type === "questAccept") {
        const qId = data.id;
        const qDef = syncedExtras.quests[qId];
        if (qId) {
            const goalsLen = qDef && Array.isArray(qDef.goals) ? qDef.goals.length : 1;
            playerProfile.quests.on[qId] = Array.from({ length: goalsLen }, () => 0);
            if (!playerProfile.quests.track.includes(qId) && playerProfile.quests.track.length < 4) {
                playerProfile.quests.track.push(qId);
            }
            saveProfile();
            sendJson(socket, { t: "msg", type: "quests", data: playerProfile.quests });
            sendJson(socket, { t: "msg", type: "questAccepted", data: { id: qId } });
        }
        return;
    }

    if (type === "questTurnIn") {
        const qId = data.id;
        if (qId && qId in playerProfile.quests.on) {
            delete playerProfile.quests.on[qId];
            const qDef = syncedExtras.quests[qId];
            if (qDef?.kind === "daily") {
                if (!playerProfile.quests.dailyDone.includes(qId)) playerProfile.quests.dailyDone.push(qId);
            } else {
                if (!playerProfile.quests.done.includes(qId)) playerProfile.quests.done.push(qId);
            }
            playerProfile.quests.track = playerProfile.quests.track.filter(id => id !== qId);

            if (qDef && qDef.reward) {
                if (qDef.reward.zeny) playerProfile.zeny += qDef.reward.zeny;
                if (qDef.reward.exp) {
                    playerProfile.exp += qDef.reward.exp;
                    sendJson(socket, { t: "msg", type: "exp", data: { n: qDef.reward.exp } });
                    while (playerProfile.exp >= expNeeded(playerProfile.level)) {
                        playerProfile.exp -= expNeeded(playerProfile.level);
                        playerProfile.level += 1;
                        playerProfile.points += 5;
                        recalcStats(playerProfile);
                        p.level = playerProfile.level;
                        p.maxHp = playerProfile.maxHp;
                        p.hp = p.maxHp;
                        broadcastRoom(room, { t: "msg", type: "levelUp", data: { sid, level: playerProfile.level } });
                    }
                }
                for (const it of (qDef.reward.items || [])) {
                    if (syncedExtras.gear && syncedExtras.gear[it.id]) {
                        playerProfile.gear.push({ id: `gear_${++gearSeq}_${Date.now()}`, item: it.id, slot: null, refine: 0 });
                    } else {
                        addBagItem(playerProfile, it.id, it.qty || 1);
                    }
                }
            }

            if (qDef && Array.isArray(qDef.goals)) {
                for (const g of qDef.goals) {
                    if (g.kind === "collect" && g.item) {
                        removeBagItem(playerProfile, g.item, g.n || 1);
                    }
                }
            }

            progressDailyAndAchievements(playerProfile, socket, "quest", 1);
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "gear", data: playerProfile.gear });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            // AUTO-UNLOCK NEXT MAIN QUEST IN CHAIN (m01 -> m02 -> ... -> m86)
            const nextQuestEntry = Object.entries(syncedExtras.quests).find(([k, q]) => q.after === qId);
            if (nextQuestEntry) {
                const nextQId = nextQuestEntry[0];
                const nextQDef = nextQuestEntry[1];
                const goalsLen = Array.isArray(nextQDef.goals) ? nextQDef.goals.length : 1;
                playerProfile.quests.on[nextQId] = Array.from({ length: goalsLen }, () => 0);
                if (!playerProfile.quests.track.includes(nextQId) && playerProfile.quests.track.length < 4) {
                    playerProfile.quests.track.push(nextQId);
                }
                sendJson(socket, { t: "msg", type: "questAccepted", data: { id: nextQId } });
            }

            sendJson(socket, { t: "msg", type: "quests", data: playerProfile.quests });
            sendJson(socket, { t: "msg", type: "questDone", data: { id: qId } });
        }
        return;
    }

    if (type === "questTrack") {
        const qId = data.id;
        if (qId) {
            const idx = playerProfile.quests.track.indexOf(qId);
            if (idx !== -1) {
                playerProfile.quests.track.splice(idx, 1);
            } else {
                playerProfile.quests.track.push(qId);
            }
            saveProfile();
            sendJson(socket, { t: "msg", type: "quests", data: playerProfile.quests });
        }
        return;
    }

    // 4.1 Skill Level Up (skillUp)
    if (type === "skillUp") {
        const sId = data.id;
        const sDef = skillsDatabase[sId];
        if (sDef) {
            if (!playerProfile.skills) playerProfile.skills = {};
            const curLv = playerProfile.skills[sId] || 0;
            if (curLv < (sDef.max || 5) && (playerProfile.skillPoints || 0) > 0) {
                playerProfile.skillPoints -= 1;
                playerProfile.skills[sId] = curLv + 1;
                saveProfile();
                sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            }
        }
        return;
    }

    // 4.2 Job Change (jobChange)
    if (type === "jobChange") {
        const newJob = String(data.job || "").toLowerCase();
        if (JOB_STARTER_SKILLS[newJob]) {
            playerProfile.job = newJob;
            if (!playerProfile.skills) playerProfile.skills = {};
            // Unlock all starter skills for the job
            for (const [sk, lv] of Object.entries(JOB_STARTER_SKILLS[newJob])) {
                if (!playerProfile.skills[sk]) playerProfile.skills[sk] = lv;
            }
            saveProfile();
            p.job = newJob;
            broadcastRoom(room, { t: "patch", players: { [sid]: { job: newJob } } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            progressQuestGoal(playerProfile, socket, g => (g.kind === "job" ? 1 : 0));
        }
        return;
    }

    // 5. Bag, Equipment, Potions, Food, Shops, Forge, Refine & Forgetter
    if (type === "drink") {
        const itemId = data.item || "potion_red";
        const pDef = syncedExtras.potions[itemId] || { heal: 60, mp: 0 };
        if (pDef.home) {
            const saveMap = playerProfile.saveMap || "aurum";
            const dest = syncedMaps[saveMap];
            const start = dest?.revive || dest?.start || { x: 0, z: 18, yaw: 0 };
            removeBagItem(playerProfile, itemId, 1);
            playerProfile.map = saveMap;
            playerProfile.x = start.x;
            playerProfile.z = start.z;
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "warp", data: { map: saveMap, roomId: "room_" + saveMap } });
            return;
        }
        removeBagItem(playerProfile, itemId, 1);
        const healAmt = pDef.heal || 0;
        const mpAmt = pDef.mp || 0;
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        p.mp = Math.min(p.maxMp, p.mp + mpAmt);
        playerProfile.hp = p.hp;
        playerProfile.mp = p.mp;
        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        broadcastRoom(room, { t: "msg", type: "drank", data: { sid, heal: healAmt, mp: mpAmt } });
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        saveProfile();
        return;
    }

    if (type === "eat") {
        const dishId = data.item;
        if (dishId && removeBagItem(playerProfile, dishId, 1)) {
            playerProfile.life.food = { id: dishId, until: Date.now() + 15 * 60000 };
            p.hp = Math.min(p.maxHp, p.hp + 100);
            playerProfile.hp = p.hp;
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "eat", item: dishId } });
            broadcastRoom(room, { t: "msg", type: "ate", data: { sid } });
        }
        return;
    }

    if (type === "sell") {
        let totalZeny = 0;
        let totalSoldQty = 0;
        if (data.all) {
            const keep = [];
            for (const it of playerProfile.items) {
                const isPotionOrFood = !!(syncedExtras.potions[it.id] || syncedExtras.recipes[it.id] || syncedExtras.eggs[it.id] || it.id.startsWith("seed_"));
                if (isPotionOrFood) {
                    keep.push(it);
                } else {
                    const unitPrice = syncedExtras.lootPrices[it.id] || 15;
                    totalZeny += unitPrice * it.qty;
                    totalSoldQty += it.qty;
                }
            }
            playerProfile.items = keep;
        } else if (data.item) {
            const qty = Math.max(1, Number(data.qty) || 1);
            if (removeBagItem(playerProfile, data.item, qty)) {
                const unitPrice = syncedExtras.lootPrices[data.item] || 15;
                totalZeny = unitPrice * qty;
                totalSoldQty = qty;
            }
        }
        if (totalSoldQty > 0) {
            playerProfile.zeny += totalZeny;
            progressQuestGoal(playerProfile, socket, g => (g.kind === "sell" ? totalSoldQty : 0));
            progressDailyAndAchievements(playerProfile, socket, "sell", totalSoldQty);
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "sold", data: { zeny: totalZeny, qty: totalSoldQty } });
        }
        return;
    }

    if (type === "gearEquip") {
        const gId = data.id;
        const targetGear = playerProfile.gear.find(g => g.id === gId);
        if (targetGear) {
            const gDef = syncedExtras.gear[targetGear.item] || { slot: "weapon" };
            const targetSlot = gDef.slot || "weapon";
            for (const g of playerProfile.gear) {
                if (g.slot === targetSlot) g.slot = null;
            }
            targetGear.slot = targetSlot;
            progressQuestGoal(playerProfile, socket, g => (g.kind === "equip" && (!g.slot || g.slot === targetSlot) ? 1 : 0));
            syncPlayerGearAndStats(playerProfile, room, sid, socket);
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "equip", id: gId } });
        }
        return;
    }

    if (type === "gearUnequip") {
        const slot = data.slot;
        for (const g of playerProfile.gear) {
            if (g.slot === slot) g.slot = null;
        }
        syncPlayerGearAndStats(playerProfile, room, sid, socket);
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "unequip", slot } });
        return;
    }

    if (type === "gearSell") {
        const gId = data.id;
        const idx = playerProfile.gear.findIndex(g => g.id === gId);
        if (idx !== -1) {
            const removed = playerProfile.gear[idx];
            const gDef = syncedExtras.gear[removed.item];
            const sellZeny = gDef?.sell || 20;
            playerProfile.gear.splice(idx, 1);
            playerProfile.zeny += sellZeny;
            syncPlayerGearAndStats(playerProfile, room, sid, socket);
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "sellGear", item: removed.item, zeny: sellZeny } });
        }
        return;
    }

    if (type === "shopBuy") {
        const item = data.item;
        const qty = Math.max(1, Number(data.qty) || 1);
        if (item) {
            const gDef = syncedExtras.gear[item];
            const pDef = syncedExtras.potions[item];
            const unitPrice = gDef?.price ?? pDef?.price ?? 20;
            const totalCost = unitPrice * qty;
            if (playerProfile.zeny < totalCost) {
                sendJson(socket, { t: "msg", type: "shopFail", data: { reason: "no_zeny" } });
                return;
            }
            playerProfile.zeny -= totalCost;
            if (gDef) {
                for (let i = 0; i < qty; i++) {
                    playerProfile.gear.push({
                        id: `gear_${++gearSeq}_${Date.now()}_${i}`,
                        item,
                        slot: null,
                        refine: 0
                    });
                }
                sendJson(socket, { t: "msg", type: "gear", data: playerProfile.gear });
            } else {
                addBagItem(playerProfile, item, qty);
            }
            progressQuestGoal(playerProfile, socket, g => (g.kind === "buy" && (!g.item || g.item === item) ? qty : 0));
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "buy", item, qty } });
        }
        return;
    }

    if (type === "forge") {
        const item = data.item;
        const recipe = syncedExtras.forge[item];
        if (!item) return;
        const zenyCost = recipe?.zeny || 1000;
        if (playerProfile.zeny < zenyCost) {
            sendJson(socket, { t: "msg", type: "shopFail", data: { reason: "no_zeny" } });
            return;
        }
        for (const req of (recipe?.items || [])) {
            removeBagItem(playerProfile, req.id, req.qty);
        }
        playerProfile.zeny -= zenyCost;
        playerProfile.gear.push({
            id: `gear_${++gearSeq}_${Date.now()}`,
            item,
            slot: null,
            refine: 0
        });
        saveProfile();
        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        sendJson(socket, { t: "msg", type: "gear", data: playerProfile.gear });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "forge", item } });
        broadcastRoom(room, { t: "msg", type: "forged", data: { sid } });
        return;
    }

    if (type === "refine") {
        const gId = data.id;
        const targetGear = playerProfile.gear.find(g => g.id === gId);
        if (!targetGear || targetGear.refine >= 10) {
            sendJson(socket, { t: "msg", type: "shopFail", data: { reason: "max_refine" } });
            return;
        }
        const cur = targetGear.refine || 0;
        const cost = 40 * (cur + 1) * (cur + 1);
        playerProfile.zeny = Math.max(0, playerProfile.zeny - cost);
        targetGear.refine = cur + 1;

        progressQuestGoal(playerProfile, socket, g => (g.kind === "refine" ? 1 : 0));
        progressDailyAndAchievements(playerProfile, socket, "refine", 1);
        syncPlayerGearAndStats(playerProfile, room, sid, socket);
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "refine", id: gId, success: true, refine: targetGear.refine } });
        broadcastRoom(room, { t: "msg", type: "refined", data: { sid, ok: true } });
        return;
    }

    if (type === "forgetBuy" || type === "forgetFree") {
        const item = data.item || "tome_forget";
        const isRenew = item === "tome_renew";
        if (isRenew) {
            const totalStats = playerProfile.str + playerProfile.vit + playerProfile.agi + playerProfile.int;
            playerProfile.str = 0;
            playerProfile.vit = 0;
            playerProfile.agi = 0;
            playerProfile.int = 0;
            playerProfile.points += Math.max(0, totalStats);
            recalcStats(playerProfile);
            sendJson(socket, { t: "msg", type: "forgot", data: { stats: true, points: playerProfile.points } });
        } else {
            const count = Object.values(playerProfile.skills || {}).reduce((a, b) => a + b, 0);
            playerProfile.skills = { firstAid: 1 };
            sendJson(socket, { t: "msg", type: "forgot", data: { stats: false, points: count } });
        }
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "forget", item, free: type === "forgetFree" } });
        return;
    }

    // 6. Storage & Market
    if (type === "storageOpen") {
        sendJson(socket, { t: "msg", type: "storage", data: playerProfile.storageItems || [] });
        sendJson(socket, { t: "msg", type: "storageGear", data: playerProfile.storageGear || [] });
        sendJson(socket, { t: "msg", type: "storageZeny", data: { zeny: playerProfile.storageZeny || 0 } });
        return;
    }

    if (type === "storageMove") {
        const { item, qty = 1, put } = data;
        if (!item) return;
        const n = Math.max(1, Number(qty) || 1);
        if (put) {
            if (removeBagItem(playerProfile, item, n)) {
                const ex = playerProfile.storageItems.find(i => i.id === item);
                if (ex) ex.qty += n;
                else playerProfile.storageItems.push({ id: item, qty: n });
            }
        } else {
            const idx = playerProfile.storageItems.findIndex(i => i.id === item);
            if (idx !== -1 && playerProfile.storageItems[idx].qty >= n) {
                playerProfile.storageItems[idx].qty -= n;
                if (playerProfile.storageItems[idx].qty <= 0) playerProfile.storageItems.splice(idx, 1);
                addBagItem(playerProfile, item, n);
            }
        }
        saveProfile();
        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        sendJson(socket, { t: "msg", type: "storage", data: playerProfile.storageItems });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "storage", item, qty: n, put: !!put } });
        return;
    }

    if (type === "storageGearMove") {
        const { id, put } = data;
        if (put) {
            const idx = playerProfile.gear.findIndex(g => g.id === id && !g.slot);
            if (idx !== -1) {
                const [g] = playerProfile.gear.splice(idx, 1);
                playerProfile.storageGear.push(g);
                saveProfile();
                sendJson(socket, { t: "msg", type: "gear", data: playerProfile.gear });
                sendJson(socket, { t: "msg", type: "storageGear", data: playerProfile.storageGear });
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "storage", item: g.item, refine: g.refine, qty: 1, put: true } });
            }
        } else {
            const idx = playerProfile.storageGear.findIndex(g => g.id === id);
            if (idx !== -1) {
                const [g] = playerProfile.storageGear.splice(idx, 1);
                playerProfile.gear.push(g);
                saveProfile();
                sendJson(socket, { t: "msg", type: "gear", data: playerProfile.gear });
                sendJson(socket, { t: "msg", type: "storageGear", data: playerProfile.storageGear });
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "storage", item: g.item, refine: g.refine, qty: 1, put: false } });
            }
        }
        return;
    }

    if (type === "storageZenyMove") {
        const n = Math.max(1, Number(data.n) || 0);
        const put = !!data.put;
        if (put && playerProfile.zeny >= n) {
            playerProfile.zeny -= n;
            playerProfile.storageZeny = (playerProfile.storageZeny || 0) + n;
        } else if (!put && (playerProfile.storageZeny || 0) >= n) {
            playerProfile.storageZeny -= n;
            playerProfile.zeny += n;
        }
        saveProfile();
        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        sendJson(socket, { t: "msg", type: "storageZeny", data: { zeny: playerProfile.storageZeny } });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "storage", zeny: true, qty: n, put } });
        return;
    }

    if (type === "marketOpen") {
        sendJson(socket, { t: "msg", type: "market", data: accountsDb.marketListings || [] });
        return;
    }

    if (type === "marketList") {
        const price = Math.max(1, Number(data.price) || 100);
        if (data.gear) {
            const idx = playerProfile.gear.findIndex(g => g.id === data.gear && !g.slot);
            if (idx !== -1) {
                const [g] = playerProfile.gear.splice(idx, 1);
                accountsDb.marketListings.push({
                    id: `mkt_${Date.now()}`,
                    seller: playerProfile.uid,
                    sellerName: playerProfile.name,
                    item: g.item,
                    qty: 1,
                    price,
                    refine: g.refine || 0
                });
                saveProfile();
                sendJson(socket, { t: "msg", type: "gear", data: playerProfile.gear });
                sendJson(socket, { t: "msg", type: "market", data: accountsDb.marketListings });
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "market", listed: g.item, refine: g.refine || 0, qty: 1 } });
            }
        } else if (data.item) {
            const qty = Math.max(1, Number(data.qty) || 1);
            if (removeBagItem(playerProfile, data.item, qty)) {
                accountsDb.marketListings.push({
                    id: `mkt_${Date.now()}`,
                    seller: playerProfile.uid,
                    sellerName: playerProfile.name,
                    item: data.item,
                    qty,
                    price
                });
                saveProfile();
                sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
                sendJson(socket, { t: "msg", type: "market", data: accountsDb.marketListings });
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "market", listed: data.item, qty } });
            }
        }
        return;
    }

    if (type === "marketBuy") {
        const idx = accountsDb.marketListings.findIndex(l => l.id === data.id);
        if (idx !== -1) {
            const listing = accountsDb.marketListings[idx];
            if (data.cancel) {
                accountsDb.marketListings.splice(idx, 1);
                if (listing.refine !== undefined || syncedExtras.gear[listing.item]) {
                    playerProfile.gear.push({ id: `gear_${++gearSeq}_${Date.now()}`, item: listing.item, slot: null, refine: listing.refine || 0 });
                    sendJson(socket, { t: "msg", type: "gear", data: playerProfile.gear });
                } else {
                    addBagItem(playerProfile, listing.item, listing.qty);
                }
                saveProfile();
                sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
                sendJson(socket, { t: "msg", type: "market", data: accountsDb.marketListings });
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "market", cancelled: true } });
            } else if (playerProfile.zeny >= listing.price) {
                playerProfile.zeny -= listing.price;
                accountsDb.marketListings.splice(idx, 1);
                if (listing.refine !== undefined || syncedExtras.gear[listing.item]) {
                    playerProfile.gear.push({ id: `gear_${++gearSeq}_${Date.now()}`, item: listing.item, slot: null, refine: listing.refine || 0 });
                    sendJson(socket, { t: "msg", type: "gear", data: playerProfile.gear });
                } else {
                    addBagItem(playerProfile, listing.item, listing.qty);
                }
                saveProfile();
                sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
                sendJson(socket, { t: "msg", type: "market", data: accountsDb.marketListings });
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "market", bought: listing.item, refine: listing.refine, qty: listing.qty } });
            }
        }
        return;
    }

    // 7. Life Skills: Fishing, Mining, Farming, Cooking
    if (type === "fishCast") {
        const yaw = typeof data.yaw === "number" ? data.yaw : p.yaw;
        const power = typeof data.power === "number" ? data.power : 0.7;
        const d = +(2.5 + power * 3.5).toFixed(2);
        const bx = +(p.x + Math.sin(yaw) * d).toFixed(2);
        const bz = +(p.z + Math.cos(yaw) * d).toFixed(2);
        sendJson(socket, {
            t: "msg",
            type: "fishCast",
            data: { x: bx, z: bz, d, shadow: null, size: 1, come: 800 }
        });
        broadcastRoom(room, { t: "msg", type: "fishLine", data: { sid, x: bx, z: bz } });
        setTimeout(() => {
            sendJson(socket, { t: "msg", type: "fishNibble", data: {} });
        }, 900);
        setTimeout(() => {
            sendJson(socket, { t: "msg", type: "fishBite", data: { ms: 2500 } });
        }, 1800);
        return;
    }

    if (type === "fishHook") {
        if (typeof data.t === "number" && data.t < 0) {
            sendJson(socket, { t: "msg", type: "fishMiss", data: { reason: "early" } });
            return;
        }
        sendJson(socket, {
            t: "msg",
            type: "fishHooked",
            data: {
                fight: {
                    dist: 2.2,
                    power: 0.75,
                    rod: Math.max(1, playerProfile.life.rod || 1),
                    seed: Math.floor(Math.random() * 100000)
                }
            }
        });
        return;
    }

    if (type === "fishLand") {
        const fishPool = ["carp", "perch", "catfish", "pike", "trout", "salmon"];
        const fish = fishPool[Math.floor(Math.random() * fishPool.length)];
        const exp = syncedExtras.fishDefs?.[fish]?.exp || 15;
        addBagItem(playerProfile, fish, 1);
        addLifeExp(playerProfile, room, sid, socket, "fish", exp);
        progressQuestGoal(playerProfile, socket, g => ((g.kind === "fish" || (g.kind === "collect" && g.item === fish)) ? 1 : 0));
        progressDailyAndAchievements(playerProfile, socket, "fish", 1);
        saveProfile();
        sendJson(socket, { t: "msg", type: "fishCaught", data: { fish, exp } });
        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        broadcastRoom(room, { t: "msg", type: "fished", data: { sid } });
        return;
    }

    if (type === "fishLose") {
        sendJson(socket, { t: "msg", type: "fishMiss", data: { reason: data.reason || "escaped" } });
        return;
    }

    if (type === "mineStrike") {
        const nodeId = data.node;
        if (!nodeId) return;
        const nodeDef = (syncedExtras.mineNodes || []).find(n => n.id === nodeId);
        const oreId = nodeDef?.ore || "copper_ore";
        const oreInfo = syncedExtras.ores?.[oreId] || { lv: 1, hits: 3, exp: 12 };
        room.strikeCounts[nodeId] = (room.strikeCounts[nodeId] || 0) + 1;
        const isLast = room.strikeCounts[nodeId] >= (oreInfo.hits || 3);

        broadcastRoom(room, { t: "msg", type: "struck", data: { sid, node: nodeId, last: isLast } });
        if (isLast) {
            room.strikeCounts[nodeId] = 0;
            const until = Date.now() + 25000;
            room.usedNodes[nodeId] = until;
            addBagItem(playerProfile, oreId, 1);
            const exp = oreInfo.exp || 12;
            addLifeExp(playerProfile, room, sid, socket, "mine", exp);
            progressQuestGoal(playerProfile, socket, g => ((g.kind === "mine" || (g.kind === "collect" && g.item === oreId)) ? 1 : 0));
            progressDailyAndAchievements(playerProfile, socket, "mine", 1);
            saveProfile();
            sendJson(socket, { t: "msg", type: "mined", data: { node: nodeId, until, ore: oreId, exp } });
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        }
        return;
    }

    if (type === "toolBuy") {
        const kind = data.kind === "pick" ? "pick" : "rod";
        const curTier = playerProfile.life[kind] || 0;
        const list = kind === "rod" ? syncedExtras.tools.rods : syncedExtras.tools.picks;
        const nextTool = list[curTier];
        if (nextTool && playerProfile.zeny >= nextTool.price) {
            playerProfile.zeny -= nextTool.price;
            playerProfile.life[kind] = curTier + 1;
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "tool", tool: nextTool.id } });
        }
        return;
    }

    if (type === "seedBuy") {
        const crop = data.crop || "carrot";
        const qty = Math.max(1, Number(data.qty) || 1);
        const cDef = syncedExtras.crops[crop] || { seed: 20 };
        const cost = (cDef.seed || 20) * qty;
        if (playerProfile.zeny >= cost) {
            playerProfile.zeny -= cost;
            addBagItem(playerProfile, `seed_${crop}`, qty);
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "seed", crop, qty } });
        }
        return;
    }

    if (type === "plotBuy") {
        if (playerProfile.life.plots.length < 8) {
            playerProfile.life.plots.push({ crop: "", at: 0, water: false });
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "plot", plots: playerProfile.life.plots.length } });
        }
        return;
    }

    if (type === "plot") {
        const plotIdx = Number(data.plot) || 0;
        const act = data.act;
        const plotsArr = room.mapId === "home" ? playerProfile.life.homePlots : playerProfile.life.plots;
        const targetPlot = plotsArr[plotIdx];
        if (!targetPlot) return;

        if (act === "plant") {
            const crop = (data.seed || "carrot").replace(/^seed_/, "");
            const seedId = `seed_${crop}`;
            removeBagItem(playerProfile, seedId, 1);
            const cDef = syncedExtras.crops[crop] || { minutes: 30 };
            targetPlot.crop = crop;
            targetPlot.at = Date.now() - Math.floor(cDef.minutes * 60000 * 0.65);
            targetPlot.water = false;
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "plant", crop } });
        } else if (act === "water") {
            targetPlot.water = true;
            targetPlot.at = Date.now() - 3600000 * 5;
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            broadcastRoom(room, { t: "msg", type: "watered", data: { sid } });
        } else if (act === "harvest") {
            const crop = targetPlot.crop || "carrot";
            const cDef = syncedExtras.crops[crop] || { yield: [2, 4], exp: 15 };
            const qty = cDef.yield ? cDef.yield[1] : 3;
            addBagItem(playerProfile, crop, qty);
            addBagItem(playerProfile, `seed_${crop}`, 1);
            targetPlot.crop = "";
            targetPlot.at = 0;
            targetPlot.water = false;
            addLifeExp(playerProfile, room, sid, socket, "farm", cDef.exp || 15);
            progressQuestGoal(playerProfile, socket, g => (g.kind === "harvest" ? qty : 0));
            progressDailyAndAchievements(playerProfile, socket, "harvest", qty);
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "harvest", crop, qty, seed: true } });
        }
        return;
    }

    if (type === "cook") {
        const dish = data.dish;
        const qty = Math.max(1, Number(data.qty) || 1);
        const rDef = syncedExtras.recipes[dish];
        if (dish && rDef) {
            for (const ing of (rDef.in || [])) {
                removeBagItem(playerProfile, ing.id, ing.qty * qty);
            }
            addBagItem(playerProfile, dish, qty);
            addLifeExp(playerProfile, room, sid, socket, "cook", (rDef.exp || 15) * qty);
            progressQuestGoal(playerProfile, socket, g => (g.kind === "cook" ? qty : 0));
            progressDailyAndAchievements(playerProfile, socket, "cook", qty);
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "cook", dish, qty } });
        }
        return;
    }

    // 8. Mounts & Pets
    if (type === "mountHire") {
        const color = data.color || "gold";
        playerProfile.life.mount = { color, until: Date.now() + 86400000 * 7 };
        playerProfile.ride = color;
        p.ride = color;
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "mount", color } });
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    if (type === "mountTrial") {
        const color = data.color || "bird_jade";
        const until = Date.now() + 120000;
        playerProfile.ride = color;
        p.ride = color;
        sendJson(socket, { t: "msg", type: "mountTrial", data: { color, until } });
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    if (type === "petBuy" || type === "petFeatherEgg") {
        const egg = data.egg || "egg_slime";
        const eDef = syncedExtras.eggs[egg] || { price: 6000 };
        if (type === "petBuy" && playerProfile.zeny >= (eDef.price || 0)) {
            playerProfile.zeny -= (eDef.price || 0);
        }
        addBagItem(playerProfile, egg, 1);
        saveProfile();
        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "pet", op: "buy", egg } });
        return;
    }

    if (type === "petNest") {
        const egg = data.egg;
        if (egg && removeBagItem(playerProfile, egg, 1)) {
            playerProfile.life.pets.nest = { egg, until: Date.now() - 1000 };
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "pet", op: "nest", egg } });
        }
        return;
    }

    if (type === "petHatch" || type === "petFurBuy") {
        let species = data.species || "slime";
        if (type === "petHatch" && playerProfile.life.pets.nest) {
            const eggId = playerProfile.life.pets.nest.egg;
            const eDef = syncedExtras.eggs[eggId];
            if (eDef && Array.isArray(eDef.hatch) && eDef.hatch.length > 0) {
                species = eDef.hatch[Math.floor(Math.random() * eDef.hatch.length)][0];
            }
            playerProfile.life.pets.nest = null;
        }
        const newPet = {
            id: `pet_${Date.now()}`,
            species,
            name: "",
            lv: 1,
            exp: 0,
            hunger: 100,
            loyalty: 50,
            shiny: Math.random() < 0.15,
            nature: "cheerful"
        };
        playerProfile.life.pets.pets.push(newPet);
        if (!playerProfile.life.pets.dex.includes(species)) {
            playerProfile.life.pets.dex.push(species);
        }
        progressDailyAndAchievements(playerProfile, socket, "hatch", 1);
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        sendJson(socket, {
            t: "msg",
            type: "shopDone",
            data: { kind: "pet", op: type === "petHatch" ? "hatch" : "fur", id: newPet.id, species: newPet.species, shiny: newPet.shiny, nature: newPet.nature }
        });
        return;
    }

    if (type === "petStarEgg") {
        const count = Number(data.n) || 1;
        const speciesKeys = Object.keys(syncedExtras.pets || { slime: 1, bunny: 1, wolf: 1, wisp: 1 });
        const got = [];
        for (let i = 0; i < count; i++) {
            const sp = speciesKeys[Math.floor(Math.random() * speciesKeys.length)] || "slime";
            const shiny = Math.random() < 0.2;
            const petObj = { id: `pet_${Date.now()}_${i}`, species: sp, name: "", lv: 1, exp: 0, hunger: 100, loyalty: 50, shiny, nature: "brave" };
            playerProfile.life.pets.pets.push(petObj);
            if (!playerProfile.life.pets.dex.includes(sp)) playerProfile.life.pets.dex.push(sp);
            got.push({ id: petObj.id, species: sp, shiny, nature: "brave", fur: 0 });
        }
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "pet", op: "star", got } });
        return;
    }

    if (type === "petOut") {
        const id = data.id || "";
        playerProfile.life.pets.out = id;
        const outPet = playerProfile.life.pets.pets.find(pt => pt.id === id);
        p.pet = outPet ? outPet.species : "";
        p.petShiny = outPet ? !!outPet.shiny : false;
        p.petName = outPet ? (outPet.name || "") : "";
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    if (type === "petPick") {
        playerProfile.life.pets.pick = !!data.on;
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        return;
    }

    if (type === "petFeed") {
        const pet = playerProfile.life.pets.pets.find(pt => pt.id === data.id);
        if (pet && data.dish && removeBagItem(playerProfile, data.dish, 1)) {
            pet.hunger = Math.min(100, (pet.hunger || 50) + 35);
            pet.loyalty = Math.min(100, (pet.loyalty || 50) + 10);
            pet.lv = Math.min(50, (pet.lv || 1) + 1);
            progressDailyAndAchievements(playerProfile, socket, "feed", 1);
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "pet", op: "feed", fav: true } });
        }
        return;
    }

    if (type === "petName") {
        const pet = playerProfile.life.pets.pets.find(pt => pt.id === data.id);
        if (pet && typeof data.name === "string") {
            pet.name = data.name.trim().slice(0, 12);
            if (playerProfile.life.pets.out === pet.id) {
                p.petName = pet.name;
                broadcastRoom(room, { t: "patch", players: { [sid]: p } });
            }
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        }
        return;
    }

    if (type === "petRelease") {
        const idx = playerProfile.life.pets.pets.findIndex(pt => pt.id === data.id);
        if (idx !== -1) {
            playerProfile.life.pets.pets.splice(idx, 1);
            if (playerProfile.life.pets.out === data.id) {
                playerProfile.life.pets.out = "";
                p.pet = "";
                broadcastRoom(room, { t: "patch", players: { [sid]: p } });
            }
            addBagItem(playerProfile, "feather_pet", 2);
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "pet", op: "release", feathers: 2 } });
        }
        return;
    }

    // 9. Home & Furniture System
    if (type === "homeBuy" || type === "homeUp") {
        const tier = Math.max(1, Math.min(3, Number(data.tier) || 1));
        playerProfile.life.home = tier;
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "home", tier } });
        return;
    }

    if (type === "homeAccess") {
        playerProfile.life.homeOpen = data.open || "friends";
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        return;
    }

    if (type === "homeFriends") {
        sendJson(socket, { t: "msg", type: "homeFriends", data: [] });
        return;
    }

    if (type === "homeGo" || type === "homeVisit") {
        playerProfile.map = "home";
        playerProfile.x = -3.2;
        playerProfile.z = 8.4;
        playerProfile.yaw = Math.PI;
        saveProfile();
        sendJson(socket, { t: "msg", type: "warp", data: { map: "home", roomId: "room_home" } });
        return;
    }

    if (type === "homeBed") {
        p.hp = p.maxHp;
        p.mp = p.maxMp;
        playerProfile.hp = p.hp;
        playerProfile.mp = p.mp;
        saveProfile();
        broadcastRoom(room, { t: "msg", type: "healed", data: { sid, n: p.maxHp } });
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    if (type === "furnBuy") {
        const id = data.id;
        const qty = Math.max(1, Number(data.qty) || 1);
        const fDef = syncedExtras.furn[id] || { gold: 3000 };
        const cost = (fDef.gold || 3000) * qty;
        if (id && playerProfile.zeny >= cost) {
            playerProfile.zeny -= cost;
            playerProfile.life.furn.own[id] = (playerProfile.life.furn.own[id] || 0) + qty;
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "furn", act: "buy", id, qty } });
        }
        return;
    }

    if (type === "furn") {
        const act = data.act;
        const placed = playerProfile.life.furn.placed || [];
        if (act === "place" && data.id) {
            if ((playerProfile.life.furn.own[data.id] || 0) > 0) {
                playerProfile.life.furn.own[data.id] -= 1;
                placed.push({ id: data.id, i: data.i, j: data.j, r: 0 });
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "furn", act: "place", id: data.id, qty: 1 } });
            }
        } else if (act === "move" && data.at && data.to) {
            const pc = placed.find(x => x.i === data.at.i && x.j === data.at.j);
            if (pc) {
                pc.i = data.to.i;
                pc.j = data.to.j;
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "furn", act: "move", id: pc.id } });
            }
        } else if (act === "turn" && data.at) {
            const pc = placed.find(x => x.i === data.at.i && x.j === data.at.j);
            if (pc) pc.r = ((pc.r || 0) + 1) % 4;
        } else if (act === "pick" && data.at) {
            const idx = placed.findIndex(x => x.i === data.at.i && x.j === data.at.j);
            if (idx !== -1) {
                const [removed] = placed.splice(idx, 1);
                playerProfile.life.furn.own[removed.id] = (playerProfile.life.furn.own[removed.id] || 0) + 1;
                sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "furn", act: "pick", id: removed.id, qty: 1 } });
            }
        }
        saveProfile();
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        sendJson(socket, {
            t: "msg",
            type: "homeView",
            data: { owner: playerProfile.uid, name: playerProfile.name, tier: playerProfile.life.home || 1, placed: playerProfile.life.furn.placed }
        });
        return;
    }

    // 10. Gem Shop, Cosmetics & Battle Pass
    if (type === "gemBuy") {
        const item = data.item;
        if (item) {
            const cost = syncedExtras.shopLook?.[item]?.gems || 200;
            playerProfile.gems = Math.max(0, (playerProfile.gems || 0) - cost);
            if (!playerProfile.shopOwned.includes(item)) playerProfile.shopOwned.push(item);
            saveProfile();
            sendJson(socket, { t: "msg", type: "shop", data: { gems: playerProfile.gems, owned: playerProfile.shopOwned } });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "gems", item } });
        }
        return;
    }

    if (type === "wear") {
        const { slot, id = "" } = data;
        if (slot) {
            if (!playerProfile.stats.worn) playerProfile.stats.worn = {};
            playerProfile.stats.worn[slot] = id;
            if (slot === "bird" || slot === "horse" || slot === "dragon") {
                playerProfile.stats.worn.bird = id;
                playerProfile.ride = id;
                p.ride = id;
            }
            p.cos = `${playerProfile.stats.worn.name || ""}|${playerProfile.stats.worn.pet || ""}`;
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        }
        return;
    }

    if (type === "passClaim") {
        const lv = Number(data.lv) || 1;
        const prem = !!data.prem;
        if (!playerProfile.stats.pass) playerProfile.stats.pass = { season: 1, pts: 0, free: [], prem: [] };
        const arr = prem ? playerProfile.stats.pass.prem : playerProfile.stats.pass.free;
        if (!arr.includes(lv)) {
            arr.push(lv);
            playerProfile.zeny += prem ? 5000 : 2000;
            addBagItem(playerProfile, "potion_white", 5);
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "pass" } });
        }
        return;
    }

    // 11. Mail System
    if (type === "mailList") {
        sendJson(socket, { t: "msg", type: "mail", data: playerProfile.mailList || [] });
        return;
    }

    if (type === "mailTake") {
        const m = (playerProfile.mailList || []).find(x => x.id === data.id);
        if (m) {
            if (m.zeny > 0) {
                playerProfile.zeny += m.zeny;
                m.zeny = 0;
            }
            for (const it of (m.items || [])) {
                addBagItem(playerProfile, it.id, it.qty || 1);
            }
            m.items = [];
            m.seen = true;
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "mail", data: playerProfile.mailList });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "mail", op: "take" } });
        }
        return;
    }

    if (type === "mailMark") {
        const idx = (playerProfile.mailList || []).findIndex(x => x.id === data.id);
        if (idx !== -1) {
            if (data.del) {
                playerProfile.mailList.splice(idx, 1);
            } else {
                playerProfile.mailList[idx].seen = true;
            }
            saveProfile();
            sendJson(socket, { t: "msg", type: "mail", data: playerProfile.mailList });
        }
        return;
    }

    if (type === "mailSend") {
        const zeny = Math.max(0, Number(data.zeny) || 0);
        playerProfile.zeny = Math.max(0, playerProfile.zeny - zeny - 100);
        for (const it of (data.items || [])) {
            removeBagItem(playerProfile, it.id, it.qty || 1);
        }
        // Deliver mail to recipient if they exist in accountsDb
        const targetName = String(data.to || "").trim().toLowerCase();
        for (const acc of Object.values(accountsDb.users)) {
            for (const ch of Object.values(acc.chars || {})) {
                if (ch.name && ch.name.toLowerCase() === targetName) {
                    if (!Array.isArray(ch.mailList)) ch.mailList = [];
                    ch.mailList.unshift({
                        id: `mail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        fromName: playerProfile.name,
                        body: String(data.body || ""),
                        zeny,
                        items: Array.isArray(data.items) ? data.items : [],
                        seen: false,
                        at: Date.now()
                    });
                }
            }
        }
        saveProfile();
        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        sendJson(socket, { t: "msg", type: "mail", data: playerProfile.mailList });
        sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "mail", op: "send", to: data.to || "" } });
        return;
    }

    // 12. Party System Handlers
    if (type === "partyInvite") {
        const targetUid = data.uid;
        if (!targetUid || targetUid === playerProfile.uid) return;

        const currentPartyId = playerParties.get(playerProfile.uid);
        let party = currentPartyId ? parties.get(currentPartyId) : null;
        if (party) {
            if (party.leader !== playerProfile.uid) {
                sendJson(socket, { t: "msg", type: "partyFail", data: { reason: "cant_invite" } });
                return;
            }
            if (party.members.length >= 6) {
                sendJson(socket, { t: "msg", type: "partyFail", data: { reason: "full" } });
                return;
            }
        }

        const targetSid = uidSessions.get(targetUid);
        const targetSocket = targetSid ? sessionSockets.get(targetSid) : null;
        const targetProfile = targetSid ? sessionProfiles.get(targetSid) : null;

        if (!targetSocket || !targetProfile) {
            sendJson(socket, { t: "msg", type: "partyFail", data: { reason: "offline" } });
            return;
        }

        if (playerParties.has(targetUid)) {
            sendJson(socket, { t: "msg", type: "partyFail", data: { reason: "in_party" } });
            return;
        }

        sendJson(targetSocket, {
            t: "msg",
            type: "partyInvite",
            data: { from: playerProfile.uid, name: playerProfile.name }
        });
        return;
    }

    if (type === "partyAnswer") {
        const fromUid = data.from;
        const accepted = !!data.yes;
        const inviterSid = uidSessions.get(fromUid);
        const inviterSocket = inviterSid ? sessionSockets.get(inviterSid) : null;
        const inviterProfile = inviterSid ? sessionProfiles.get(inviterSid) : null;

        if (!accepted) {
            if (inviterSocket) {
                sendJson(inviterSocket, { t: "msg", type: "partyFail", data: { reason: "declined" } });
            }
            return;
        }

        if (!inviterSocket || !inviterProfile) {
            sendJson(socket, { t: "msg", type: "partyFail", data: { reason: "offline" } });
            return;
        }

        if (playerParties.has(playerProfile.uid)) {
            return; // Already in a party
        }

        let partyId = playerParties.get(fromUid);
        let party = partyId ? parties.get(partyId) : null;

        if (party) {
            if (party.members.length >= 6) {
                sendJson(socket, { t: "msg", type: "partyFail", data: { reason: "full" } });
                return;
            }
            party.members.push(buildPartyMember(playerProfile));
            playerParties.set(playerProfile.uid, party.id);
            sendPartyInfoToMembers(party, { kind: "join", name: playerProfile.name });
            syncPartyToMembers(party);
        } else {
            partyId = "party_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
            party = {
                id: partyId,
                leader: fromUid,
                even: true,
                members: [
                    buildPartyMember(inviterProfile),
                    buildPartyMember(playerProfile)
                ]
            };
            parties.set(partyId, party);
            playerParties.set(fromUid, partyId);
            playerParties.set(playerProfile.uid, partyId);
            sendPartyInfoToMembers(party, { kind: "join", name: playerProfile.name });
            syncPartyToMembers(party);
        }
        return;
    }

    if (type === "partyLeave") {
        const partyId = playerParties.get(playerProfile.uid);
        if (!partyId || !parties.has(partyId)) {
            sendJson(socket, { t: "msg", type: "party", data: null });
            return;
        }
        const party = parties.get(partyId);
        playerParties.delete(playerProfile.uid);
        party.members = party.members.filter(m => m.uid !== playerProfile.uid);
        sendJson(socket, { t: "msg", type: "party", data: null });

        if (party.members.length === 0) {
            parties.delete(partyId);
        } else {
            if (party.leader === playerProfile.uid) {
                party.leader = party.members[0].uid;
                sendPartyInfoToMembers(party, { kind: "lead", name: party.members[0].name });
            }
            sendPartyInfoToMembers(party, { kind: "leave", name: playerProfile.name });
            syncPartyToMembers(party);
        }
        return;
    }

    if (type === "partyKick") {
        const targetUid = data.uid;
        const partyId = playerParties.get(playerProfile.uid);
        if (!partyId || !parties.has(partyId)) return;
        const party = parties.get(partyId);

        if (party.leader !== playerProfile.uid || targetUid === playerProfile.uid) {
            return;
        }

        const idx = party.members.findIndex(m => m.uid === targetUid);
        if (idx !== -1) {
            const kicked = party.members[idx];
            party.members.splice(idx, 1);
            playerParties.delete(targetUid);

            const kickedSid = uidSessions.get(targetUid);
            if (kickedSid && sessionSockets.has(kickedSid)) {
                sendJson(sessionSockets.get(kickedSid), { t: "msg", type: "party", data: null });
            }

            sendPartyInfoToMembers(party, { kind: "kick", name: kicked.name });
            if (party.members.length === 0) {
                parties.delete(partyId);
            } else {
                syncPartyToMembers(party);
            }
        }
        return;
    }

    if (type === "partyLead") {
        const targetUid = data.uid;
        const partyId = playerParties.get(playerProfile.uid);
        if (!partyId || !parties.has(partyId)) return;
        const party = parties.get(partyId);

        if (party.leader !== playerProfile.uid) return;
        const target = party.members.find(m => m.uid === targetUid);
        if (target) {
            party.leader = targetUid;
            sendPartyInfoToMembers(party, { kind: "lead", name: target.name });
            syncPartyToMembers(party);
        }
        return;
    }

    if (type === "partyShare") {
        const partyId = playerParties.get(playerProfile.uid);
        if (!partyId || !parties.has(partyId)) return;
        const party = parties.get(partyId);

        if (party.leader !== playerProfile.uid) return;
        party.even = !!data.even;
        syncPartyToMembers(party);
        return;
    }

    // 13. Guild & Dungeons
    if (type === "guildCreate") {
        const name = (data.name || "FinalSlop").trim();
        const emblem = data.emblem || "0.0.5.2";
        playerProfile.guildData = {
            id: `guild_${Date.now()}`,
            name,
            emblem,
            notice: "ยินดีต้อนรับสู่กิลด์ " + name,
            exp: 0,
            zeny: 0,
            members: [{ uid: playerProfile.uid, name: playerProfile.name, role: "master", level: playerProfile.level, job: playerProfile.job, online: true, contrib: 0 }]
        };
        playerProfile.guild = name;
        p.guild = name;
        p.emblem = emblem;
        saveProfile();
        sendJson(socket, { t: "msg", type: "guild", data: playerProfile.guildData });
        sendJson(socket, { t: "msg", type: "guildDone", data: { kind: "created", name } });
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    if (type === "guildNotice") {
        if (playerProfile.guildData) {
            playerProfile.guildData.notice = String(data.notice || "").slice(0, 120);
            saveProfile();
            sendJson(socket, { t: "msg", type: "guild", data: playerProfile.guildData });
        }
        return;
    }

    if (type === "guildEmblem") {
        if (playerProfile.guildData && data.emblem) {
            playerProfile.guildData.emblem = data.emblem;
            p.emblem = data.emblem;
            saveProfile();
            sendJson(socket, { t: "msg", type: "guild", data: playerProfile.guildData });
            broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        }
        return;
    }

    if (type === "guildDonate") {
        const zeny = Math.max(100, Number(data.zeny) || 1000);
        if (playerProfile.guildData && playerProfile.zeny >= zeny) {
            playerProfile.zeny -= zeny;
            playerProfile.guildData.zeny = (playerProfile.guildData.zeny || 0) + zeny;
            playerProfile.guildData.exp = (playerProfile.guildData.exp || 0) + Math.floor(zeny / 10);
            const me = playerProfile.guildData.members.find(m => m.uid === playerProfile.uid);
            if (me) me.contrib = (me.contrib || 0) + zeny;
            saveProfile();
            sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
            sendJson(socket, { t: "msg", type: "guild", data: playerProfile.guildData });
        }
        return;
    }

    if (type === "guildLeave" || type === "guildDisband") {
        playerProfile.guildData = null;
        playerProfile.guild = "";
        p.guild = "";
        saveProfile();
        sendJson(socket, { t: "msg", type: "guild", data: null });
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    if (type === "dungeonInfo") {
        const dunMap = { pip: "grotto", goblin: "warren", jungle: "temple", reef: "galleon", dunes: "hive", rift: "forge", spirit: "sanctum", prismcanyon: "prismhall", clockruins: "gearvault", bloodmoor: "bloodcathedral", echochasm: "voidrift", wick: "crypt" };
        const dunId = dunMap[room.mapId] || "grotto";
        sendJson(socket, {
            t: "msg",
            type: "dungeonInfo",
            data: {
                id: dunId,
                lv: [10, 20],
                waves: [1, 2, 3],
                boss: { kind: "toadking", level: 15 },
                chest: { zeny: 5000 },
                members: [{ uid: playerProfile.uid, name: playerProfile.name, level: playerProfile.level, here: true, chestDone: false }],
                leader: true,
                running: null
            }
        });
        return;
    }

    if (type === "dungeonStart" || type === "dungeonJoin") {
        const dunMap = { pip: "grotto", goblin: "warren", jungle: "temple", reef: "galleon", dunes: "hive", rift: "forge", spirit: "sanctum", prismcanyon: "prismhall", clockruins: "gearvault", bloodmoor: "bloodcathedral", echochasm: "voidrift", wick: "crypt" };
        const dunId = dunMap[room.mapId] || "grotto";
        playerProfile.map = dunId;
        playerProfile.x = 0;
        playerProfile.z = 12;
        saveProfile();
        sendJson(socket, { t: "msg", type: "warp", data: { map: dunId, roomId: "room_" + dunId } });
        return;
    }

    if (type === "dungeonLeave") {
        const saveMap = playerProfile.saveMap || "aurum";
        playerProfile.map = saveMap;
        playerProfile.x = 0;
        playerProfile.z = 18;
        saveProfile();
        sendJson(socket, { t: "msg", type: "warp", data: { map: saveMap, roomId: "room_" + saveMap } });
        return;
    }

    if (type === "chestOpen") {
        playerProfile.zeny += 5000;
        addBagItem(playerProfile, "potion_white", 5);
        playerProfile.stats.dun = (playerProfile.stats.dun || 0) + 1;
        progressDailyAndAchievements(playerProfile, socket, "dungeon", 1);
        saveProfile();
        sendJson(socket, { t: "msg", type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } });
        sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        sendJson(socket, { t: "msg", type: "chestOpened", data: { zeny: 5000, items: [{ id: "potion_white", qty: 5 }] } });
        return;
    }

    // 13. Emotes, Ride, Chat, Stats, Skills, Job Change, Restyle, Save, GM
    if (type === "emote") {
        if (data.id === "sit") {
            p.sit = !p.sit;
            p.lie = false;
        } else if (data.id === "lie") {
            p.lie = !p.lie;
            p.sit = false;
        } else {
            broadcastRoom(room, { t: "msg", type: "emote", data: { sid, id: data.id } });
        }
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    if (type === "ride") {
        const defaultMount = playerProfile.stats.worn?.bird || playerProfile.life.mount?.color || "gold";
        p.ride = p.ride ? "" : defaultMount;
        playerProfile.ride = p.ride;
        saveProfile();
        broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        return;
    }

    if (type === "chat") {
        const text = String(data.text || "").trim();
        if (!text) return;
        broadcastRoom(room, {
            t: "msg",
            type: "chat",
            data: {
                ch: data.ch || "map",
                sid,
                uid: p.uid,
                from: p.name,
                text,
                at: Date.now()
            }
        });
        return;
    }

    if (type === "statUp") {
        const st = data.stat;
        if (playerProfile.points > 0 && ["str", "vit", "agi", "int"].includes(st)) {
            playerProfile[st] += 1;
            playerProfile.points -= 1;
            recalcStats(playerProfile);
            p.maxHp = playerProfile.maxHp;
            p.maxMp = playerProfile.maxMp;
            p.hp = p.maxHp;
            p.mp = p.maxMp;
            progressQuestGoal(playerProfile, socket, g => (g.kind === "stat" ? 1 : 0));
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        } else {
            sendJson(socket, { t: "msg", type: "statError", data: {} });
        }
        return;
    }

    if (type === "skillUp") {
        const sk = data.id;
        if (sk) {
            playerProfile.skills[sk] = (playerProfile.skills[sk] || 0) + 1;
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
        }
        return;
    }

    if (type === "jobChange") {
        if (data.job) {
            playerProfile.job = data.job;
            playerProfile.style = data.style || 0;
            p.job = playerProfile.job;
            p.style = playerProfile.style;
            progressQuestGoal(playerProfile, socket, g => (g.kind === "job" ? 1 : 0));
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: "shopDone", data: { kind: "job" } });
            broadcastRoom(room, { t: "msg", type: "jobChanged", data: { sid, job: playerProfile.job } });
            broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        }
        return;
    }

    if (type === "makeChar" || type === "restyle") {
        if (data.code) {
            playerProfile.look = data.code;
            p.look = data.code;
            if (data.name && typeof data.name === "string" && data.name.trim()) {
                playerProfile.name = data.name.trim();
                p.name = playerProfile.name;
            }
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            sendJson(socket, { t: "msg", type: type === "makeChar" ? "made" : "shopDone", data: { kind: "restyle", zeny: 0 } });
            broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        }
        return;
    }

    if (type === "save") {
        const same = playerProfile.saveMap === room.mapId;
        playerProfile.saveMap = room.mapId;
        progressQuestGoal(playerProfile, socket, g => (g.kind === "save" ? 1 : 0));
        saveProfile();
        sendJson(socket, { t: "msg", type: "saved", data: { map: room.mapId, same } });
        return;
    }

    if (type === "warpTown") {
        const toMap = data.to || "aurum";
        const dest = syncedMaps[toMap];
        const start = dest?.start || { x: 0, z: 18, yaw: 0 };
        playerProfile.map = toMap;
        playerProfile.x = start.x;
        playerProfile.z = start.z;
        playerProfile.yaw = start.yaw || 0;
        if (!playerProfile.stats.towns.includes(toMap)) playerProfile.stats.towns.push(toMap);
        progressQuestGoal(playerProfile, socket, g => (g.kind === "visit" && g.map === toMap ? 1 : 0));
        saveProfile();
        sendJson(socket, { t: "msg", type: "warp", data: { map: toMap, roomId: "room_" + toMap } });
        return;
    }

    if (type === "gm") {
        if (data.op === "list") {
            const rows = [];
            for (const [mId, r] of roomsByMap.entries()) {
                for (const [s, pl] of r.players.entries()) {
                    rows.push({ sid: s, uid: pl.uid, name: pl.name, level: pl.level, job: pl.job, map: mId, x: Math.round(pl.x), z: Math.round(pl.z) });
                }
            }
            sendJson(socket, { t: "msg", type: "gmList", data: { rows } });
        } else if (data.op === "map" && data.map) {
            const dest = syncedMaps[data.map];
            const start = dest?.start || { x: 0, z: 0, yaw: 0 };
            playerProfile.map = data.map;
            playerProfile.x = start.x;
            playerProfile.z = start.z;
            progressQuestGoal(playerProfile, socket, g => (g.kind === "visit" && g.map === data.map ? 1 : 0));
            saveProfile();
            sendJson(socket, { t: "msg", type: "warp", data: { map: data.map, roomId: "room_" + data.map } });
        } else if (data.op === "spot" && typeof data.x === "number" && typeof data.z === "number") {
            p.x = data.x;
            p.z = data.z;
            playerProfile.x = p.x;
            playerProfile.z = p.z;
            saveProfile();
            sendJson(socket, { t: "msg", type: "correct", data: { x: p.x, z: p.z, yaw: p.yaw } });
            broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        } else if (data.op === "lv" && data.n) {
            playerProfile.level = Math.max(1, Math.min(150, Number(data.n) || 1));
            playerProfile.points += 15;
            recalcStats(playerProfile);
            p.level = playerProfile.level;
            p.maxHp = playerProfile.maxHp;
            p.hp = p.maxHp;
            progressQuestGoal(playerProfile, socket, g => (g.kind === "level" && playerProfile.level >= g.n ? g.n : 0));
            saveProfile();
            sendJson(socket, { t: "msg", type: "char", data: buildCharPayload(playerProfile) });
            broadcastRoom(room, { t: "msg", type: "levelUp", data: { sid, level: p.level } });
            broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        } else if (data.op === "zeny" && data.n) {
            playerProfile.zeny += Number(data.n) || 10000;
            saveProfile();
            sendJson(socket, { t: "msg", type: "wallet", data: { zeny: playerProfile.zeny } });
        } else if (data.op === "hide") {
            playerProfile.gmState = { ...(playerProfile.gmState || { hide: false, god: false, speed: 1 }), hide: !!data.on };
            p.hide = !!data.on;
            saveProfile();
            sendJson(socket, { t: "msg", type: "gmMode", data: playerProfile.gmState });
            broadcastRoom(room, { t: "patch", players: { [sid]: p } });
        } else if (data.op === "god") {
            playerProfile.gmState = { ...(playerProfile.gmState || { hide: false, god: false, speed: 1 }), god: !!data.on };
            saveProfile();
            sendJson(socket, { t: "msg", type: "gmMode", data: playerProfile.gmState });
        } else if (data.op === "speed") {
            const spd = Math.max(1, Math.min(5, Number(data.n) || 1));
            playerProfile.gmState = { ...(playerProfile.gmState || { hide: false, god: false, speed: 1 }), speed: spd };
            saveProfile();
            sendJson(socket, { t: "msg", type: "gmMode", data: playerProfile.gmState });
        }
        return;
    }

    if (type === "channels") {
        sendJson(socket, { t: "msg", type: "channels", data: { list: [{ ch: 1, n: room.players.size, max: 50 }] } });
        return;
    }
}

// ============================================================================
// Game World Tick (Monster AI, Respawns, Auto-Pickup Drops, Periodic Auto-Save)
// ============================================================================
setInterval(() => {
    const now = Date.now();
    for (const room of roomsByMap.values()) {
        if (room.clients.size === 0) continue;

        const patchedMonsters = {};
        const patchedPlayers = {};
        const removedDrops = [];

        const mapDef = syncedMaps[room.mapId];
        if (!room.spawnedFromDef && mapDef && Array.isArray(mapDef.spawns) && mapDef.spawns.length > 0) {
            populateMonstersForRoom(room, mapDef);
            for (const [mId, m] of room.monsters.entries()) {
                patchedMonsters[mId] = m;
            }
        }

        // Monster AI & Respawn Loop
        for (const [mId, m] of room.monsters.entries()) {
            if (m.mode === "dead") {
                if (now - m.deadAt >= 6500) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * m.spawnR;
                    m.x = +(m.spawnX + Math.cos(angle) * dist).toFixed(2);
                    m.z = +(m.spawnZ + Math.sin(angle) * dist).toFixed(2);
                    m.hp = m.maxHp;
                    m.mode = "idle";
                    m.targetSid = null;
                    m.nextMoveAt = now + 2000;
                    patchedMonsters[mId] = m;
                }
                continue;
            }

            if (m.mode === "chase" && m.targetSid) {
                const target = room.players.get(m.targetSid);
                const targetProf = sessionProfiles.get(m.targetSid);
                if (!target || !targetProf || Math.hypot(target.x - m.spawnX, target.z - m.spawnZ) > m.spawnR + 16) {
                    m.mode = "walk";
                    m.targetSid = null;
                    m.x = m.spawnX;
                    m.z = m.spawnZ;
                    m.hp = m.maxHp;
                    patchedMonsters[mId] = m;
                    continue;
                }
                const dx = target.x - m.x;
                const dz = target.z - m.z;
                const dist = Math.hypot(dx, dz);
                m.yaw = +Math.atan2(dx, dz).toFixed(2);

                if (dist > 1.35) {
                    const step = Math.min(dist - 1.1, 0.38);
                    m.x = +(m.x + (dx / dist) * step).toFixed(2);
                    m.z = +(m.z + (dz / dist) * step).toFixed(2);
                    patchedMonsters[mId] = m;
                } else if (now - m.lastAttackAt >= 1500) {
                    m.lastAttackAt = now;
                    m.lunge = (m.lunge || 0) + 1;
                    const dmg = targetProf.gmState?.god ? 0 : Math.max(1, Math.round(4 + m.level * 2.0 - targetProf.vit * 0.6));
                    target.hp = Math.max(1, target.hp - dmg);
                    targetProf.hp = target.hp;
                    patchedMonsters[mId] = m;
                    patchedPlayers[m.targetSid] = target;
                    broadcastRoom(room, { t: "msg", type: "hurt", data: { sid: m.targetSid, dmg } });
                }
            } else if (now >= m.nextMoveAt) {
                if (m.mode === "idle") {
                    m.mode = "walk";
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * m.spawnR;
                    const tx = m.spawnX + Math.cos(angle) * dist;
                    const tz = m.spawnZ + Math.sin(angle) * dist;
                    m.yaw = +Math.atan2(tx - m.x, tz - m.z).toFixed(2);
                    m.x = +tx.toFixed(2);
                    m.z = +tz.toFixed(2);
                    m.nextMoveAt = now + 1800 + Math.random() * 2000;
                } else {
                    m.mode = "idle";
                    m.nextMoveAt = now + 2000 + Math.random() * 3000;
                }
                patchedMonsters[mId] = m;
            }
        }

        // Check Drop Pickups by Players
        for (const [dId, d] of room.drops.entries()) {
            if (now - d.createdAt > 60000) {
                room.drops.delete(dId);
                removedDrops.push(dId);
                continue;
            }
            for (const [sid, p] of room.players.entries()) {
                const prof = sessionProfiles.get(sid);
                if (!prof) continue;
                const pickupRadius = (prof.life?.pets?.out && prof.life?.pets?.pick) ? 5.2 : 3.0;
                if (Math.hypot(p.x - d.x, p.z - d.z) <= pickupRadius) {
                    room.drops.delete(dId);
                    removedDrops.push(dId);
                    const sock = room.clients.get(sid);
                    if (d.item === "coin") {
                        prof.zeny = (prof.zeny || 0) + d.qty;
                        if (sock) {
                            sendJson(sock, { t: "msg", type: "wallet", data: { zeny: prof.zeny } });
                            sendJson(sock, { t: "msg", type: "bag", data: { zeny: prof.zeny, items: prof.items } });
                        }
                    } else if (syncedExtras.gear && (syncedExtras.gear[d.item] || extractedGearData[d.item])) {
                        prof.gear = prof.gear || [];
                        const gId = "gear_" + (++gearSeq) + "_" + Date.now();
                        prof.gear.push({ id: gId, item: d.item, slot: null, refine: 0 });
                        if (sock) {
                            sendJson(sock, { t: "msg", type: "gear", data: prof.gear });
                        }
                    } else {
                        const realItem = resolveLootId(d.item);
                        addBagItem(prof, realItem, d.qty);
                        if (sock) {
                            sendJson(sock, { t: "msg", type: "bag", data: { zeny: prof.zeny, items: prof.items } });
                            progressQuestGoal(prof, sock, g => (g.kind === "collect" && (g.item === realItem || g.item === d.item) ? d.qty : 0));
                        }
                    }
                    saveAccountsDb();
                    broadcastRoom(room, { t: "msg", type: "picked", data: { id: dId, sid, item: d.item, qty: d.qty } });
                    break;
                }
            }
        }

        if (Object.keys(patchedMonsters).length > 0 || Object.keys(patchedPlayers).length > 0 || removedDrops.length > 0) {
            broadcastRoom(room, {
                t: "patch",
                ...(Object.keys(patchedPlayers).length ? { players: patchedPlayers } : {}),
                ...(Object.keys(patchedMonsters).length ? { monsters: patchedMonsters } : {}),
                ...(removedDrops.length ? { removeDrops: removedDrops } : {})
            });
        }
    }
}, 200);

// Auto-save all active player coordinates every 5 seconds
setInterval(() => {
    if (sessionProfiles.size > 0) {
        saveAccountsDb();
    }
}, 5000);

// ============================================================================
// HTTP, Auth & MatchMake Server
// ============================================================================
function readJsonBody(req) {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
            try { resolve(JSON.parse(body || "{}")); } catch (e) { resolve({}); }
        });
    });
}

function buildCharsResponse(account) {
    const charsList = [];
    for (const [slotStr, ch] of Object.entries(account.chars || {})) {
        if (!ch) continue;
        charsList.push({
            id: ch.id || `${account.id}_char_${slotStr}`,
            slot: Number(slotStr),
            name: ch.name || "",
            level: ch.level || 1,
            job: ch.job || "novice",
            style: ch.style || 0,
            look: ch.look || "",
            map: ch.map || "aurum",
            gear: formatWornGearString(ch)
        });
    }
    return {
        slots: 3,
        chars: charsList,
        gems: account.gems || 0
    };
}

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // ------------------------------------------------------------------------
    // Account Authentication & Cross-Device Backup APIs (/api/auth/*)
    // ------------------------------------------------------------------------
    if (req.method === "POST" && pathname === "/api/auth/register") {
        const body = await readJsonBody(req);
        const rawUser = String(body.username || "").trim();
        const password = String(body.password || "");
        const charName = String(body.charName || rawUser).trim();

        if (rawUser.length < 3 || rawUser.length > 20 || !/^[a-zA-Z0-9_]+$/.test(rawUser)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "ไอดีผู้เล่นต้องมีความยาว 3-20 ตัวอักษร (ภาษาอังกฤษ ตัวเลข หรือ _)" }));
            return;
        }
        if (password.length < 4) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร" }));
            return;
        }

        const unameKey = rawUser.toLowerCase();
        if (accountsDb.users[unameKey]) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "ไอดีผู้เล่นนี้มีในระบบแล้ว กรุณาใช้ชื่ออื่นหรือเข้าสู่ระบบ" }));
            return;
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const passwordHash = hashPassword(password, salt);
        const token = "tok_" + crypto.randomBytes(24).toString("hex");
        const accountId = "acc_" + crypto.randomBytes(6).toString("hex");
        const lookCode = typeof body.lookCode === "string" ? body.lookCode.trim() : "";
        const starterChar = createStarterCharacter(accountId, 0, charName || rawUser, lookCode);
        const newAccount = {
            id: accountId,
            username: rawUser,
            salt,
            passwordHash,
            token,
            createdAt: Date.now(),
            gems: 0,
            chars: {
                "0": starterChar
            }
        };

        accountsDb.users[unameKey] = newAccount;
        accountsDb.tokens[token] = unameKey;
        saveAccountsDb();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            token,
            account: {
                id: newAccount.id,
                username: newAccount.username,
                createdAt: newAccount.createdAt
            }
        }));
        return;
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
        const body = await readJsonBody(req);
        const rawUser = String(body.username || "").trim();
        const password = String(body.password || "");
        const unameKey = rawUser.toLowerCase();

        const acc = accountsDb.users[unameKey];
        if (!acc || hashPassword(password, acc.salt) !== acc.passwordHash) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "ไอดีผู้เล่นหรือรหัสผ่านไม่ถูกต้อง" }));
            return;
        }

        if (!acc.token) {
            acc.token = "tok_" + crypto.randomBytes(24).toString("hex");
        }
        accountsDb.tokens[acc.token] = unameKey;
        saveAccountsDb();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            token: acc.token,
            account: {
                id: acc.id,
                username: acc.username,
                createdAt: acc.createdAt
            }
        }));
        return;
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
        const acc = getAccountByToken(req.headers.authorization || parsedUrl.searchParams.get("token"));
        if (!acc) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "unauthorized" }));
            return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            account: {
                id: acc.id,
                username: acc.username,
                createdAt: acc.createdAt,
                chars: Object.values(acc.chars || {}).map(c => ({ slot: c.slot, name: c.name, level: c.level, job: c.job, map: c.map }))
            }
        }));
        return;
    }

    // Export full account save as JSON file for cross-device migration
    if (req.method === "GET" && pathname === "/api/auth/export") {
        const acc = getAccountByToken(req.headers.authorization || parsedUrl.searchParams.get("token"));
        if (!acc) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "unauthorized" }));
            return;
        }
        const exportBundle = {
            version: 1,
            exportedAt: new Date().toISOString(),
            account: {
                id: acc.id,
                username: acc.username,
                salt: acc.salt,
                passwordHash: acc.passwordHash,
                createdAt: acc.createdAt,
                gems: acc.gems || 0,
                chars: acc.chars || {}
            }
        };
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="FinalSlop_Account_${acc.username}.json"`
        });
        res.end(JSON.stringify(exportBundle, null, 2));
        return;
    }

    // Import account save JSON file on a new machine
    if (req.method === "POST" && pathname === "/api/auth/import") {
        const body = await readJsonBody(req);
        const impAcc = body.account;
        if (!impAcc || !impAcc.username || !impAcc.chars) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "ไฟล์ข้อมูลบัญชีไม่ถูกต้อง" }));
            return;
        }
        const unameKey = String(impAcc.username).trim().toLowerCase();
        const token = "tok_" + crypto.randomBytes(24).toString("hex");
        const salt = impAcc.salt || crypto.randomBytes(16).toString("hex");
        const passwordHash = impAcc.passwordHash || hashPassword(body.password || "1234", salt);

        accountsDb.users[unameKey] = {
            id: impAcc.id || ("acc_" + crypto.randomBytes(6).toString("hex")),
            username: String(impAcc.username).trim(),
            salt,
            passwordHash,
            token,
            createdAt: impAcc.createdAt || Date.now(),
            gems: impAcc.gems || 0,
            chars: impAcc.chars
        };
        accountsDb.tokens[token] = unameKey;
        saveAccountsDb();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            token,
            account: {
                id: accountsDb.users[unameKey].id,
                username: accountsDb.users[unameKey].username
            }
        }));
        return;
    }

    // ------------------------------------------------------------------------
    // Sync Game Data from Client Bundle
    // ------------------------------------------------------------------------
    if (req.method === "POST" && pathname === "/__SyncGameData") {
        const parsed = await readJsonBody(req);
        if (parsed.maps) {
            syncedMaps = { ...syncedMaps, ...parsed.maps };
            for (const [mId, r] of roomsByMap.entries()) {
                if (!r.spawnedFromDef && syncedMaps[mId]?.spawns?.length) {
                    populateMonstersForRoom(r, syncedMaps[mId]);
                    broadcastRoom(r, { t: "patch", monsters: Object.fromEntries(r.monsters) });
                }
            }
        }
        if (parsed.monsters) {
            syncedMonsters = { ...syncedMonsters, ...parsed.monsters };
        }
        if (parsed.extras) {
            for (const [k, v] of Object.entries(parsed.extras)) {
                if (v && typeof v === "object") {
                    syncedExtras[k] = Array.isArray(v) ? v : { ...(syncedExtras[k] || {}), ...v };
                }
            }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // ------------------------------------------------------------------------
    // Character Slots API (/chars, /chars/name, /chars/delete)
    // ------------------------------------------------------------------------
    if (pathname === "/chars" || pathname.startsWith("/chars/")) {
        const acc = getAccountByToken(req.headers.authorization);
        if (!acc) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "unavailable" }));
            return;
        }

        if (req.method === "POST" && pathname === "/chars/job") {
            const body = await readJsonBody(req);
            const slot = String(Number(body.slot) || 0);
            const newJob = String(body.job || "").toLowerCase();
            if (acc.chars && acc.chars[slot] && JOB_STARTER_SKILLS[newJob]) {
                const ch = acc.chars[slot];
                ch.job = newJob;
                if (!ch.skills) ch.skills = {};
                for (const [sk, lv] of Object.entries(JOB_STARTER_SKILLS[newJob])) {
                    if (!ch.skills[sk]) ch.skills[sk] = lv;
                }
                saveAccountsDb();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true, job: newJob, skills: ch.skills }));
                return;
            }
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid job or slot" }));
            return;
        }

        if (req.method === "POST" && pathname === "/chars/name") {
            const body = await readJsonBody(req);
            const slot = Math.max(0, Math.min(2, Number(body.slot) || 0));
            const name = String(body.name || "").trim();
            if (name.length < 2 || name.length > 16) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "name_short" }));
                return;
            }
            if (!acc.chars) acc.chars = {};
            const lookCode = typeof body.lookCode === "string" ? body.lookCode.trim() : "";
            if (!acc.chars[String(slot)]) {
                acc.chars[String(slot)] = createStarterCharacter(acc.id, slot, name, lookCode);
            } else {
                acc.chars[String(slot)].name = name;
                if (lookCode) acc.chars[String(slot)].look = lookCode;
            }
            saveAccountsDb();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(buildCharsResponse(acc)));
            return;
        }

        if (req.method === "POST" && pathname === "/chars/delete") {
            const body = await readJsonBody(req);
            const slot = String(Number(body.slot) || 0);
            if (acc.chars && acc.chars[slot]) {
                delete acc.chars[slot];
                saveAccountsDb();
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(buildCharsResponse(acc)));
            return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(buildCharsResponse(acc)));
        return;
    }

    // ------------------------------------------------------------------------
    // Colyseus Matchmaking HTTP API
    // ------------------------------------------------------------------------
    if (req.method === "POST" && pathname.startsWith("/matchmake/")) {
        const options = await readJsonBody(req);
        const token = options.token || req.headers.authorization || "";
        const acc = getAccountByToken(token);
        const charSlot = Number(options.char) || 0;
        const charProf = acc ? getOrCreateCharForAccount(acc, charSlot) : null;

        const mapName = options.map || charProf?.map || "aurum";
        const sessionId = "sess_" + crypto.randomBytes(6).toString("hex");
        const room = getOrCreateMapRoom(mapName);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            name: "town",
            processId: "local_proc",
            roomId: room.roomId,
            sessionId: sessionId,
            map: mapName,
            charSlot: charSlot,
            token: String(token).replace(/^Bearer\s+/i, ""),
            localJsonMode: true
        }));
        return;
    }

    // Version check API
    if (pathname === "/version") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ build: "d658b5871ccc9871aa8300a513ffa1672b768612" }));
        return;
    }

    // Audio & Voice clips fallback
    if (pathname.endsWith(".mp3") || pathname.startsWith("/voice/")) {
        const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
        const filePath = path.join(PUBLIC_DIR, safePath);
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { "Content-Type": "audio/mpeg" });
            fs.createReadStream(filePath).pipe(res);
            return;
        }
        res.writeHead(200, {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=86400"
        });
        res.end(SILENT_MP3);
        return;
    }

    // Static Files
    if (pathname === "/" || pathname === "/play" || pathname === "/play/") {
        pathname = "/index.html";
    }

    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
    const filePath = path.join(PUBLIC_DIR, safePath);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
                res.writeHead(200, {
                    "Content-Type": "image/png",
                    "Cache-Control": "no-cache"
                });
                res.end(TRANSPARENT_PNG);
                return;
            }
            if ([".mp3", ".wav", ".ogg"].includes(ext)) {
                res.writeHead(200, {
                    "Content-Type": "audio/mpeg",
                    "Cache-Control": "no-cache"
                });
                res.end(SILENT_MP3);
                return;
            }
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("404 Not Found: " + pathname);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const isHtml = ext === ".html";
        res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": isHtml ? "no-cache, no-store, must-revalidate" : "no-cache",
            "Pragma": "no-cache",
            "Expires": "0"
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

// ============================================================================
// WebSocket Upgrade Handler
// ============================================================================
server.on("upgrade", (req, socket, head) => {
    const key = req.headers["sec-websocket-key"];
    if (!key) {
        socket.destroy();
        return;
    }

    const acceptKey = crypto
        .createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");

    socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
    );

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const sessionId = parsedUrl.searchParams.get("sessionId") || ("sess_" + crypto.randomBytes(6).toString("hex"));
    const token = parsedUrl.searchParams.get("token") || "";
    const charSlot = Number(parsedUrl.searchParams.get("char")) || 0;

    let acc = getAccountByToken(token);
    if (!acc) {
        // Fallback guest account if connected without token
        const guestKey = "guest";
        if (!accountsDb.users[guestKey]) {
            accountsDb.users[guestKey] = {
                id: "acc_guest",
                username: "Guest",
                salt: "guest",
                passwordHash: "",
                token: "guest_token",
                createdAt: Date.now(),
                gems: 0,
                chars: { "0": createStarterCharacter("acc_guest", 0, "นักผจญภัย") }
            };
            accountsDb.tokens["guest_token"] = guestKey;
        }
        acc = accountsDb.users[guestKey];
    }

    const playerProfile = getOrCreateCharForAccount(acc, charSlot);
    sessionProfiles.set(sessionId, playerProfile);

    const requestedMap = parsedUrl.searchParams.get("map") || playerProfile.map || "aurum";
    const room = getOrCreateMapRoom(requestedMap);

    const mapDef = syncedMaps[requestedMap];
    if (playerProfile.map !== requestedMap) {
        playerProfile.map = requestedMap;
        if (mapDef && mapDef.start) {
            playerProfile.x = mapDef.start.x;
            playerProfile.z = mapDef.start.z;
            playerProfile.yaw = mapDef.start.yaw || 0;
        }
    }

    const pEntity = buildPlayerEntity(playerProfile);
    room.clients.set(sessionId, socket);
    room.players.set(sessionId, pEntity);
    sessionSockets.set(sessionId, socket);
    sessionRooms.set(sessionId, room);
    sessionUids.set(sessionId, playerProfile.uid);
    uidSessions.set(playerProfile.uid, sessionId);

    console.log(`[Account:${acc.username} | Char:${playerProfile.name} (Slot ${charSlot}) | Map:${requestedMap}] Joined (${sessionId})`);

    let playerPartyData = null;
    if (playerParties.has(playerProfile.uid)) {
        const party = parties.get(playerParties.get(playerProfile.uid));
        if (party) {
            const mem = party.members.find(m => m.uid === playerProfile.uid);
            if (mem) {
                mem.on = true;
                mem.map = requestedMap;
                mem.level = playerProfile.level;
                mem.hp = playerProfile.hp;
                mem.maxHp = playerProfile.maxHp;
                mem.down = (playerProfile.hp || 0) <= 0;
            }
            playerPartyData = party;
            syncPartyToMembers(party);
        }
    }

    const initMessages = [
        { type: "clock", data: { now: Date.now() } },
        { type: "party", data: playerPartyData },
        { type: "map", data: { ch: 1, save: playerProfile.saveMap || "aurum" } },
        { type: "nodes", data: room.usedNodes || {} },
        { type: "char", data: buildCharPayload(playerProfile) },
        { type: "gear", data: playerProfile.gear },
        { type: "bag", data: { zeny: playerProfile.zeny, items: playerProfile.items } },
        { type: "quests", data: playerProfile.quests },
        { type: "shop", data: { gems: playerProfile.gems || 0, owned: playerProfile.shopOwned || [] } },
        { type: "mail", data: playerProfile.mailList || [] },
        { type: "guild", data: playerProfile.guildData || null },
        { type: "gmMode", data: playerProfile.gmState || { hide: false, god: false, speed: 1 } },
        {
            type: "chatHistory",
            data: [
                {
                    ch: "system",
                    uid: "",
                    from: "System",
                    text: `ยินดีต้อนรับคุณ "${playerProfile.name}" (บัญชี: ${acc.username}) เข้าสู่โลก Final Slop! ข้อมูลความคืบหน้าของคุณถูกบันทึกอัตโนมัติทุกครั้งที่เล่น`,
                    at: Date.now()
                }
            ]
        }
    ];

    if (requestedMap === "home") {
        initMessages.push({
            type: "homeView",
            data: {
                owner: playerProfile.uid,
                name: playerProfile.name,
                tier: playerProfile.life.home || 1,
                placed: playerProfile.life.furn?.placed || []
            }
        });
    }

    sendJson(socket, {
        t: "init",
        players: Object.fromEntries(room.players),
        monsters: Object.fromEntries(room.monsters),
        drops: Object.fromEntries(room.drops),
        messages: initMessages
    });

    // Notify other players in the same map
    broadcastRoom(room, { t: "patch", players: { [sessionId]: pEntity } });

    let recvBuffer = Buffer.alloc(0);
    if (head && head.length > 0) {
        recvBuffer = Buffer.concat([recvBuffer, head]);
    }

    socket.on("data", (chunk) => {
        recvBuffer = Buffer.concat([recvBuffer, chunk]);
        recvBuffer = parseWsFrames(recvBuffer, (opcode, payload) => {
            if (opcode === 0x08) {
                socket.end();
                return;
            }
            if (opcode === 0x09) {
                const pong = Buffer.alloc(2 + payload.length);
                pong[0] = 0x8a;
                pong[1] = payload.length;
                payload.copy(pong, 2);
                socket.write(pong);
                return;
            }
            if (opcode === 0x01) {
                try {
                    const msg = JSON.parse(payload.toString("utf8"));
                    if (msg.t === "msg" && msg.type) {
                        handleClientAction(room, sessionId, socket, msg.type, msg.data);
                    }
                } catch (e) {}
            }
        });
    });

    const cleanup = () => {
        if (room.clients.has(sessionId)) {
            room.clients.delete(sessionId);
            room.players.delete(sessionId);
            sessionProfiles.delete(sessionId);
            sessionSockets.delete(sessionId);
            sessionRooms.delete(sessionId);
            sessionUids.delete(sessionId);
            if (uidSessions.get(playerProfile.uid) === sessionId) {
                uidSessions.delete(playerProfile.uid);
            }
            if (playerParties.has(playerProfile.uid)) {
                const party = parties.get(playerParties.get(playerProfile.uid));
                if (party) {
                    const mem = party.members.find(m => m.uid === playerProfile.uid);
                    if (mem) {
                        mem.on = false;
                        syncPartyToMembers(party);
                    }
                }
            }
            saveAccountsDb();
            broadcastRoom(room, { t: "patch", removePlayers: [sessionId] });
            console.log(`[Account:${acc.username} | Char:${playerProfile.name}] Saved & Left (${sessionId})`);
        }
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("==============================================================");
    console.log(` Final Slop - Local Account & Multi-Device Server Running!`);
    console.log(` Local URL:   http://localhost:${PORT}`);
    console.log("==============================================================");
});
