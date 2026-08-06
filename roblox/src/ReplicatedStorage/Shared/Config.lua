-- Pirate Nation Roblox port config (inspired by Proof of Play OSS)
local Config = {
	GameName = "Pirate Nation (Roblox Archive Port)",
	Version = "0.1.0",

	-- Currencies (no chain; DataStore-backed)
	Starting = {
		Marks = 100,
		Gold = 0,
		Gems = 0,
		Energy = 20,
		EnergyMax = 20,
		EnergyRegenSeconds = 180, -- 1 energy / 3 min
	},

	-- Quest energy costs + reward bands
	QuestTiers = {
		{
			id = "skullduggery",
			name = "Skullduggery",
			desc = "Combat-focused raids for loot and XP.",
			energy = 3,
			durationSec = 8,
			rewards = { marks = {12, 22}, gold = {0, 2}, xp = {15, 28}, mats = 2 },
		},
		{
			id = "exploration",
			name = "Exploration",
			desc = "Chart islands and haul crafting materials.",
			energy = 2,
			durationSec = 6,
			rewards = { marks = {8, 14}, gold = {0, 1}, xp = {10, 18}, mats = 3 },
		},
		{
			id = "privateering",
			name = "Privateering",
			desc = "Trade routes and mark-heavy bounties.",
			energy = 4,
			durationSec = 10,
			rewards = { marks = {20, 40}, gold = {1, 4}, xp = {12, 20}, mats = 1 },
		},
	},

	Gauntlet = {
		energyCost = 5,
		playerMaxHp = 40,
		enemyBaseHp = 28,
		playerMaxAp = 3,
		handSize = 5,
		difficulties = {
			{ id = "easy", name = "Easy", hpMult = 0.85, dmgMult = 0.8, rewardMult = 1.0 },
			{ id = "normal", name = "Normal", hpMult = 1.0, dmgMult = 1.0, rewardMult = 1.4 },
			{ id = "hard", name = "Hard", hpMult = 1.35, dmgMult = 1.25, rewardMult = 2.0 },
		},
	},

	Ships = {
		{ id = "skiff", name = "Skiff", hull = 30, cannons = 1, slots = 2, cost = {} },
		{ id = "sloop", name = "Sloop", hull = 45, cannons = 2, slots = 3, cost = { Wood = 12, Cotton = 6, Iron = 4 } },
		{ id = "brig", name = "Brig", hull = 65, cannons = 3, slots = 4, cost = { Wood = 24, Cotton = 12, Iron = 10, GoldNugget = 2 } },
		{ id = "galleon", name = "Galleon", hull = 90, cannons = 4, slots = 5, cost = { Wood = 40, Cotton = 20, Iron = 18, GoldNugget = 5, CannonPart = 3 } },
	},

	Materials = {
		"Wood",
		"Cotton",
		"Iron",
		"GoldNugget",
		"CannonPart",
		"MapFragment",
		"Rum",
	},

	Remotes = {
		GetState = "PN_GetState",
		StartQuest = "PN_StartQuest",
		CollectQuest = "PN_CollectQuest",
		StartGauntlet = "PN_StartGauntlet",
		PlayCard = "PN_PlayCard",
		EndTurn = "PN_EndTurn",
		CraftShip = "PN_CraftShip",
		RecruitPirate = "PN_RecruitPirate",
		StateChanged = "PN_StateChanged",
		CombatEvent = "PN_CombatEvent",
		Toast = "PN_Toast",
	},
}

return Config
