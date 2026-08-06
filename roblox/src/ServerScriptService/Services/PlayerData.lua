local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Cards = require(Shared.Cards)
local Recipes = require(Shared.Recipes)
local Util = require(Shared.Util)

local PlayerData = {}
PlayerData._cache = {}
PlayerData._combat = {} -- userId -> combat state
PlayerData._store = nil

local function getStore()
	if PlayerData._store then
		return PlayerData._store
	end
	local ok, store = pcall(function()
		return DataStoreService:GetDataStore("PirateNation_v1")
	end)
	if ok then
		PlayerData._store = store
	end
	return PlayerData._store
end

local function defaultInventory()
	local inv = {
		Marks = Config.Starting.Marks,
		Gold = Config.Starting.Gold,
		Gems = Config.Starting.Gems,
	}
	for _, m in ipairs(Config.Materials) do
		inv[m] = 0
	end
	inv.Wood = 8
	inv.Cotton = 4
	inv.Iron = 2
	return inv
end

local function defaultPirate(name)
	return {
		name = name,
		level = 1,
		xp = 0,
		xpToLevel = 50,
	}
end

function PlayerData.DefaultState()
	return {
		version = 1,
		energy = Config.Starting.Energy,
		energyMax = Config.Starting.EnergyMax,
		energyUpdatedAt = Util.Now(),
		inventory = defaultInventory(),
		shipId = "skiff",
		crew = { defaultPirate("Cabin Hand") },
		deck = Cards.CloneStarterDeck(),
		activeQuest = nil, -- { tierId, startedAt, endsAt, seed }
		stats = {
			questsDone = 0,
			gauntletsWon = 0,
			gauntletsLost = 0,
			damageDealt = 0,
		},
	}
end

local function regenEnergy(state)
	local now = Util.Now()
	local elapsed = math.max(0, now - (state.energyUpdatedAt or now))
	local gain = math.floor(elapsed / Config.Starting.EnergyRegenSeconds)
	if gain > 0 and state.energy < state.energyMax then
		state.energy = math.min(state.energyMax, state.energy + gain)
		state.energyUpdatedAt = state.energyUpdatedAt + gain * Config.Starting.EnergyRegenSeconds
	elseif state.energy >= state.energyMax then
		state.energyUpdatedAt = now
	end
end

function PlayerData.PublicView(state, userId)
	regenEnergy(state)
	local combat = PlayerData._combat[userId]
	return {
		energy = state.energy,
		energyMax = state.energyMax,
		inventory = Util.DeepCopy(state.inventory),
		shipId = state.shipId,
		crew = Util.DeepCopy(state.crew),
		deckCount = #state.deck,
		activeQuest = state.activeQuest and Util.DeepCopy(state.activeQuest) or nil,
		stats = Util.DeepCopy(state.stats),
		combat = combat and {
			active = true,
			difficulty = combat.difficulty,
			turn = combat.turn,
			playerHp = combat.playerHp,
			playerShield = combat.playerShield,
			playerAp = combat.playerAp,
			enemyHp = combat.enemyHp,
			enemyShield = combat.enemyShield,
			enemyName = combat.enemyName,
			hand = Util.DeepCopy(combat.hand),
			log = Util.DeepCopy(combat.log),
			over = combat.over,
			won = combat.won,
		} or { active = false },
		ships = Config.Ships,
		questTiers = Config.QuestTiers,
		gauntlet = Config.Gauntlet,
		recipes = Recipes,
	}
end

function PlayerData.Load(player)
	local userId = player.UserId
	if PlayerData._cache[userId] then
		return PlayerData._cache[userId]
	end
	local state = PlayerData.DefaultState()
	local store = getStore()
	if store then
		local ok, data = pcall(function()
			return store:GetAsync("p_" .. userId)
		end)
		if ok and type(data) == "table" and data.version then
			state = data
			-- ensure keys
			if not state.inventory then
				state.inventory = defaultInventory()
			end
			if not state.deck or #state.deck == 0 then
				state.deck = Cards.CloneStarterDeck()
			end
			if not state.crew or #state.crew == 0 then
				state.crew = { defaultPirate("Cabin Hand") }
			end
		end
	end
	regenEnergy(state)
	PlayerData._cache[userId] = state
	return state
end

function PlayerData.Save(player)
	local userId = player.UserId
	local state = PlayerData._cache[userId]
	if not state then
		return
	end
	local store = getStore()
	if not store then
		return
	end
	pcall(function()
		store:SetAsync("p_" .. userId, state)
	end)
end

function PlayerData.Get(player)
	return PlayerData.Load(player)
end

function PlayerData.Unload(player)
	PlayerData.Save(player)
	PlayerData._cache[player.UserId] = nil
	PlayerData._combat[player.UserId] = nil
end

function PlayerData.SetCombat(player, combat)
	PlayerData._combat[player.UserId] = combat
end

function PlayerData.GetCombat(player)
	return PlayerData._combat[player.UserId]
end

function PlayerData.ClearCombat(player)
	PlayerData._combat[player.UserId] = nil
end

Players.PlayerRemoving:Connect(function(player)
	PlayerData.Unload(player)
end)

game:BindToClose(function()
	for _, p in ipairs(Players:GetPlayers()) do
		PlayerData.Save(p)
	end
end)

return PlayerData
