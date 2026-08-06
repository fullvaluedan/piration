local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)

local Services = script.Parent:WaitForChild("Services")
local PlayerData = require(Services.PlayerData)
local GameService = require(Services.GameService)

-- Remotes
local folder = Instance.new("Folder")
folder.Name = "PirateNationRemotes"
folder.Parent = ReplicatedStorage

local remotes = {}
for key, name in pairs(Config.Remotes) do
	local r
	if key == "StateChanged" or key == "CombatEvent" or key == "Toast" then
		r = Instance.new("RemoteEvent")
	elseif key == "GetState" then
		r = Instance.new("RemoteFunction")
	else
		r = Instance.new("RemoteFunction")
	end
	r.Name = name
	r.Parent = folder
	remotes[key] = r
end

-- World: starter island + dock
local function part(props)
	local p = Instance.new("Part")
	for k, v in pairs(props) do
		p[k] = v
	end
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = Workspace
	return p
end

local island = part({
	Name = "StarterIsland",
	Size = Vector3.new(80, 12, 80),
	Position = Vector3.new(0, 5, 0),
	Color = Color3.fromRGB(210, 180, 120),
	Material = Enum.Material.Sand,
})

part({
	Name = "IslandGrass",
	Size = Vector3.new(60, 2, 60),
	Position = Vector3.new(0, 12, 0),
	Color = Color3.fromRGB(76, 140, 70),
	Material = Enum.Material.Grass,
})

-- palm trunks
for i = 1, 5 do
	local a = i * 1.1
	local x = math.cos(a) * 22
	local z = math.sin(a) * 22
	part({
		Name = "PalmTrunk",
		Size = Vector3.new(2, 14, 2),
		Position = Vector3.new(x, 18, z),
		Color = Color3.fromRGB(110, 75, 40),
		Material = Enum.Material.Wood,
	})
	part({
		Name = "PalmLeaf",
		Size = Vector3.new(10, 1, 10),
		Position = Vector3.new(x, 26, z),
		Color = Color3.fromRGB(40, 120, 50),
		Material = Enum.Material.Grass,
		Shape = Enum.PartType.Cylinder,
	})
end

-- dock
part({
	Name = "Dock",
	Size = Vector3.new(14, 1.5, 40),
	Position = Vector3.new(0, 11.5, 50),
	Color = Color3.fromRGB(120, 85, 50),
	Material = Enum.Material.WoodPlanks,
})

-- simple skiff at dock
local function shipModel(name, pos, scale, color)
	local model = Instance.new("Model")
	model.Name = name
	model.Parent = Workspace
	local hull = part({
		Name = "Hull",
		Size = Vector3.new(10, 3, 22) * scale,
		Position = pos,
		Color = color,
		Material = Enum.Material.Wood,
	})
	hull.Parent = model
	local mast = part({
		Name = "Mast",
		Size = Vector3.new(1, 16, 1) * scale,
		Position = pos + Vector3.new(0, 9 * scale, 0),
		Color = Color3.fromRGB(90, 60, 35),
		Material = Enum.Material.Wood,
	})
	mast.Parent = model
	local sail = part({
		Name = "Sail",
		Size = Vector3.new(10, 10, 0.4) * scale,
		Position = pos + Vector3.new(0, 12 * scale, -1),
		Color = Color3.fromRGB(245, 240, 220),
		Material = Enum.Material.Fabric,
	})
	sail.Parent = model
	model.PrimaryPart = hull
	return model
end

shipModel("PlayerSkiff", Vector3.new(0, 12, 62), 1, Color3.fromRGB(140, 95, 55))

-- spawn
local spawn = Instance.new("SpawnLocation")
spawn.Name = "PirateSpawn"
spawn.Size = Vector3.new(8, 1, 8)
spawn.Position = Vector3.new(0, 13.5, 10)
spawn.Anchored = true
spawn.Duration = 0
spawn.Neutral = true
spawn.Color = Color3.fromRGB(180, 140, 80)
spawn.Material = Enum.Material.WoodPlanks
spawn.Parent = Workspace

-- floating title board
local board = part({
	Name = "TitleBoard",
	Size = Vector3.new(28, 8, 1),
	Position = Vector3.new(0, 22, -30),
	Color = Color3.fromRGB(40, 30, 20),
	Material = Enum.Material.Wood,
})
local gui = Instance.new("SurfaceGui")
gui.Face = Enum.NormalId.Front
gui.Parent = board
local label = Instance.new("TextLabel")
label.Size = UDim2.fromScale(1, 1)
label.BackgroundTransparency = 1
label.Text = "PIRATE NATION\nRoblox Archive Port"
label.TextColor3 = Color3.fromRGB(255, 220, 120)
label.TextScaled = true
label.Font = Enum.Font.GothamBold
label.Parent = gui

print("[PirateNation] " .. Config.GameName .. " v" .. Config.Version)

-- wire remotes
remotes.GetState.OnServerInvoke = function(player)
	return GameService.GetState(remotes, player)
end

local function wrap(fn)
	return function(player, ...)
		local ok, a, b = pcall(fn, remotes, player, ...)
		if not ok then
			warn("[PirateNation] err", a)
			return false, "Server error"
		end
		return a, b
	end
end

remotes.StartQuest.OnServerInvoke = wrap(GameService.StartQuest)
remotes.CollectQuest.OnServerInvoke = wrap(GameService.CollectQuest)
remotes.StartGauntlet.OnServerInvoke = wrap(GameService.StartGauntlet)
remotes.PlayCard.OnServerInvoke = wrap(GameService.PlayCard)
remotes.EndTurn.OnServerInvoke = wrap(GameService.EndTurn)
remotes.CraftShip.OnServerInvoke = wrap(GameService.CraftShip)
remotes.RecruitPirate.OnServerInvoke = wrap(GameService.RecruitPirate)

-- Craft item uses same craft ship remote pattern — add dedicated if needed
local craftItem = Instance.new("RemoteFunction")
craftItem.Name = "PN_CraftItem"
craftItem.Parent = folder
craftItem.OnServerInvoke = wrap(GameService.CraftItem)

Players.PlayerAdded:Connect(function(player)
	PlayerData.Load(player)
	player.CharacterAdded:Connect(function(char)
		local hum = char:WaitForChild("Humanoid", 5)
		if hum then
			hum.WalkSpeed = 18
		end
	end)
	task.defer(function()
		remotes.StateChanged:FireClient(player, GameService.GetState(remotes, player))
	end)
end)

for _, p in ipairs(Players:GetPlayers()) do
	PlayerData.Load(p)
	remotes.StateChanged:FireClient(p, GameService.GetState(remotes, p))
end
