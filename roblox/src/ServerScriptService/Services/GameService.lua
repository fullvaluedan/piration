local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Cards = require(Shared.Cards)
local Recipes = require(Shared.Recipes)
local Util = require(Shared.Util)
local PlayerData = require(script.Parent.PlayerData)

local GameService = {}

local function toast(remote, player, msg)
	remote:FireClient(player, msg)
end

local function pushState(remotes, player)
	local state = PlayerData.Get(player)
	remotes.StateChanged:FireClient(player, PlayerData.PublicView(state, player.UserId))
end

local function shipById(id)
	for _, s in ipairs(Config.Ships) do
		if s.id == id then
			return s
		end
	end
end

local function tierById(id)
	for _, t in ipairs(Config.QuestTiers) do
		if t.id == id then
			return t
		end
	end
end

local function addCrewXp(state, amount)
	local p = state.crew[1]
	if not p then
		return
	end
	p.xp += amount
	while p.xp >= p.xpToLevel do
		p.xp -= p.xpToLevel
		p.level += 1
		p.xpToLevel = math.floor(p.xpToLevel * 1.35)
	end
end

local MAT_POOL = { "Wood", "Cotton", "Iron", "GoldNugget", "MapFragment", "CannonPart", "Rum" }

function GameService.StartQuest(remotes, player, tierId)
	local state = PlayerData.Get(player)
	if state.activeQuest then
		return false, "Quest already running"
	end
	if PlayerData.GetCombat(player) then
		return false, "Finish combat first"
	end
	local tier = tierById(tierId)
	if not tier then
		return false, "Unknown quest"
	end
	if state.energy < tier.energy then
		return false, "Not enough energy"
	end
	state.energy -= tier.energy
	state.energyUpdatedAt = Util.Now()
	local now = Util.Now()
	state.activeQuest = {
		tierId = tier.id,
		name = tier.name,
		startedAt = now,
		endsAt = now + tier.durationSec,
		seed = Random.new():NextInteger(1, 1e9),
	}
	pushState(remotes, player)
	toast(remotes.Toast, player, "Set sail: " .. tier.name)
	return true
end

function GameService.CollectQuest(remotes, player)
	local state = PlayerData.Get(player)
	local q = state.activeQuest
	if not q then
		return false, "No active quest"
	end
	if Util.Now() < q.endsAt then
		return false, "Still at sea..."
	end
	local tier = tierById(q.tierId)
	if not tier then
		state.activeQuest = nil
		return false, "Bad quest data"
	end
	local rng = Random.new(q.seed)
	local marks = Util.RandInt(rng, tier.rewards.marks[1], tier.rewards.marks[2])
	local gold = Util.RandInt(rng, tier.rewards.gold[1], tier.rewards.gold[2])
	local xp = Util.RandInt(rng, tier.rewards.xp[1], tier.rewards.xp[2])
	state.inventory.Marks = (state.inventory.Marks or 0) + marks
	state.inventory.Gold = (state.inventory.Gold or 0) + gold
	for _ = 1, tier.rewards.mats do
		local m = MAT_POOL[Util.RandInt(rng, 1, #MAT_POOL)]
		-- rarer mats less often
		if m == "CannonPart" or m == "Rum" then
			if rng:NextNumber() > 0.35 then
				m = "Wood"
			end
		end
		state.inventory[m] = (state.inventory[m] or 0) + 1
	end
	addCrewXp(state, xp)
	state.stats.questsDone += 1
	state.activeQuest = nil
	pushState(remotes, player)
	toast(remotes.Toast, player, string.format("Looted +%d Marks, +%d Gold, +%d XP", marks, gold, xp))
	return true
end

local ENEMY_NAMES = {
	"Brine Raider",
	"Skull Sloop",
	"Coral Wraith",
	"Iron Privateer",
	"Dread Dinghy",
	"Siren Barge",
}

function GameService.StartGauntlet(remotes, player, difficultyId)
	local state = PlayerData.Get(player)
	if PlayerData.GetCombat(player) then
		return false, "Already in combat"
	end
	if state.activeQuest then
		return false, "Finish or wait out your quest"
	end
	local diff
	for _, d in ipairs(Config.Gauntlet.difficulties) do
		if d.id == difficultyId then
			diff = d
			break
		end
	end
	if not diff then
		return false, "Bad difficulty"
	end
	if state.energy < Config.Gauntlet.energyCost then
		return false, "Not enough energy"
	end
	state.energy -= Config.Gauntlet.energyCost
	state.energyUpdatedAt = Util.Now()

	local ship = shipById(state.shipId) or shipById("skiff")
	local crewLv = (state.crew[1] and state.crew[1].level) or 1
	local rng = Random.new()
	local deck = Util.DeepCopy(state.deck)
	Util.Shuffle(rng, deck)
	local drawPile = deck
	local hand = {}
	for _ = 1, Config.Gauntlet.handSize do
		if #drawPile == 0 then
			break
		end
		table.insert(hand, table.remove(drawPile, 1))
	end

	local enemyHp = math.floor(Config.Gauntlet.enemyBaseHp * diff.hpMult + (crewLv - 1) * 2)
	local combat = {
		difficulty = diff.id,
		rewardMult = diff.rewardMult,
		dmgMult = diff.dmgMult,
		turn = 1,
		playerHp = Config.Gauntlet.playerMaxHp + (ship.hull // 5),
		playerMaxHp = Config.Gauntlet.playerMaxHp + (ship.hull // 5),
		playerShield = 0,
		playerAp = Config.Gauntlet.playerMaxAp + math.max(0, ship.cannons - 1),
		playerMaxAp = Config.Gauntlet.playerMaxAp + math.max(0, ship.cannons - 1),
		enemyHp = enemyHp,
		enemyMaxHp = enemyHp,
		enemyShield = 0,
		enemyName = ENEMY_NAMES[rng:NextInteger(1, #ENEMY_NAMES)],
		enemyDmg = math.floor(5 * diff.dmgMult),
		hand = hand,
		drawPile = drawPile,
		discard = {},
		log = { "Engaged " .. ENEMY_NAMES[1] .. "!" },
		over = false,
		won = false,
		rngSeed = rng:NextInteger(1, 1e9),
	}
	-- fix enemy name in log
	combat.log[1] = "Engaged " .. combat.enemyName .. "!"
	PlayerData.SetCombat(player, combat)
	pushState(remotes, player)
	remotes.CombatEvent:FireClient(player, { type = "start" })
	return true
end

local function drawCards(combat, n)
	for _ = 1, n do
		if #combat.drawPile == 0 then
			if #combat.discard == 0 then
				break
			end
			combat.drawPile = combat.discard
			combat.discard = {}
			local rng = Random.new(combat.rngSeed + combat.turn * 17)
			Util.Shuffle(rng, combat.drawPile)
		end
		if #combat.drawPile > 0 then
			table.insert(combat.hand, table.remove(combat.drawPile, 1))
		end
	end
end

local function applyDamage(hp, shield, dmg)
	local s = shield
	local h = hp
	if s > 0 then
		local absorb = math.min(s, dmg)
		s -= absorb
		dmg -= absorb
	end
	h -= dmg
	return h, s
end

local function checkEnd(remotes, player, state, combat)
	if combat.enemyHp <= 0 then
		combat.over = true
		combat.won = true
		combat.enemyHp = 0
		local mult = combat.rewardMult or 1
		local marks = math.floor(35 * mult)
		local gold = math.floor(3 * mult)
		state.inventory.Marks = (state.inventory.Marks or 0) + marks
		state.inventory.Gold = (state.inventory.Gold or 0) + gold
		state.inventory.Iron = (state.inventory.Iron or 0) + math.floor(2 * mult)
		addCrewXp(state, math.floor(30 * mult))
		state.stats.gauntletsWon += 1
		table.insert(combat.log, string.format("Victory! +%d Marks +%d Gold", marks, gold))
		toast(remotes.Toast, player, "Gauntlet won!")
	elseif combat.playerHp <= 0 then
		combat.over = true
		combat.won = false
		combat.playerHp = 0
		state.stats.gauntletsLost += 1
		table.insert(combat.log, "Your ship was boarded... defeat.")
		toast(remotes.Toast, player, "Defeated at sea")
	end
end

function GameService.PlayCard(remotes, player, handIndex)
	local state = PlayerData.Get(player)
	local combat = PlayerData.GetCombat(player)
	if not combat or combat.over then
		return false, "No combat"
	end
	handIndex = tonumber(handIndex)
	if not handIndex or handIndex < 1 or handIndex > #combat.hand then
		return false, "Bad card"
	end
	local cardId = combat.hand[handIndex]
	local card = Cards.Get(cardId)
	if not card then
		return false, "Unknown card"
	end
	if combat.playerAp < card.ap then
		return false, "Not enough AP"
	end
	combat.playerAp -= card.ap
	table.remove(combat.hand, handIndex)
	table.insert(combat.discard, cardId)

	if card.damage > 0 then
		local dmg = card.damage
		combat.enemyHp, combat.enemyShield = applyDamage(combat.enemyHp, combat.enemyShield, dmg)
		state.stats.damageDealt += dmg
		table.insert(combat.log, string.format("%s hits for %d", card.name, dmg))
	end
	if card.shield > 0 then
		combat.playerShield += card.shield
		table.insert(combat.log, string.format("%s +%d shield", card.name, card.shield))
	end
	if card.heal > 0 then
		combat.playerHp = math.min(combat.playerMaxHp, combat.playerHp + card.heal)
		table.insert(combat.log, string.format("%s repairs %d", card.name, card.heal))
	end
	if card.draw > 0 then
		drawCards(combat, card.draw)
		table.insert(combat.log, string.format("%s: draw %d", card.name, card.draw))
	end
	if card.kind == "Resource" then
		combat.playerAp = math.min(combat.playerMaxAp + 1, combat.playerAp + 1)
		table.insert(combat.log, card.name .. " grants +1 AP")
	end

	checkEnd(remotes, player, state, combat)
	if combat.over then
		-- keep combat visible until client dismisses via EndTurn/GetState after clear
	end
	pushState(remotes, player)
	remotes.CombatEvent:FireClient(player, { type = "card", card = card.name })
	return true
end

function GameService.EndTurn(remotes, player)
	local state = PlayerData.Get(player)
	local combat = PlayerData.GetCombat(player)
	if not combat then
		return false, "No combat"
	end
	if combat.over then
		PlayerData.ClearCombat(player)
		pushState(remotes, player)
		return true
	end

	-- enemy acts
	local dmg = combat.enemyDmg + math.floor(combat.turn / 3)
	local before = combat.playerHp
	combat.playerHp, combat.playerShield = applyDamage(combat.playerHp, combat.playerShield, dmg)
	table.insert(combat.log, string.format("%s fires for %d", combat.enemyName, dmg))
	checkEnd(remotes, player, state, combat)

	if not combat.over then
		combat.turn += 1
		combat.playerAp = combat.playerMaxAp
		combat.playerShield = math.max(0, math.floor(combat.playerShield * 0.5))
		-- discard hand and draw fresh
		for _, id in ipairs(combat.hand) do
			table.insert(combat.discard, id)
		end
		combat.hand = {}
		drawCards(combat, Config.Gauntlet.handSize)
		table.insert(combat.log, "--- Turn " .. combat.turn .. " ---")
	end

	pushState(remotes, player)
	remotes.CombatEvent:FireClient(player, { type = "turn" })
	return true, before
end

function GameService.CraftShip(remotes, player, shipId)
	local state = PlayerData.Get(player)
	if state.shipId == shipId then
		return false, "Already own this hull"
	end
	-- must craft in order
	local order = { "skiff", "sloop", "brig", "galleon" }
	local curIdx, wantIdx = 1, nil
	for i, id in ipairs(order) do
		if id == state.shipId then
			curIdx = i
		end
		if id == shipId then
			wantIdx = i
		end
	end
	if not wantIdx or wantIdx ~= curIdx + 1 then
		return false, "Craft the next ship in line"
	end
	local ship = shipById(shipId)
	if not ship then
		return false, "Unknown ship"
	end
	local ok, missing = Util.CanPay(state.inventory, ship.cost)
	if not ok then
		return false, "Need more " .. tostring(missing)
	end
	Util.Pay(state.inventory, ship.cost)
	state.shipId = shipId
	pushState(remotes, player)
	toast(remotes.Toast, player, "Launched the " .. ship.name .. "!")
	return true
end

function GameService.CraftItem(remotes, player, recipeId)
	local state = PlayerData.Get(player)
	local recipe
	for _, r in ipairs(Recipes.Items) do
		if r.id == recipeId then
			recipe = r
			break
		end
	end
	if not recipe then
		return false, "Unknown recipe"
	end
	local ok, missing = Util.CanPay(state.inventory, recipe.cost)
	if not ok then
		return false, "Need more " .. tostring(missing)
	end
	Util.Pay(state.inventory, recipe.cost)
	Util.Grant(state.inventory, recipe.gives)
	pushState(remotes, player)
	toast(remotes.Toast, player, "Crafted " .. recipe.name)
	return true
end

function GameService.RecruitPirate(remotes, player)
	local state = PlayerData.Get(player)
	local ship = shipById(state.shipId) or shipById("skiff")
	if #state.crew >= ship.slots then
		return false, "Ship crew full — upgrade hull"
	end
	local ok, missing = Util.CanPay(state.inventory, Recipes.RecruitCost)
	if not ok then
		return false, "Need more " .. tostring(missing)
	end
	Util.Pay(state.inventory, Recipes.RecruitCost)
	local names = { "Pegleg Pat", "Salty Rue", "Cannon Mia", "Mapmaker Oz", "Reef Raider", "Jonah Flint" }
	local name = names[Random.new():NextInteger(1, #names)]
	table.insert(state.crew, {
		name = name,
		level = 1,
		xp = 0,
		xpToLevel = 50,
	})
	pushState(remotes, player)
	toast(remotes.Toast, player, name .. " joined the crew!")
	return true
end

function GameService.GetState(remotes, player)
	local state = PlayerData.Get(player)
	return PlayerData.PublicView(state, player.UserId)
end

return GameService
