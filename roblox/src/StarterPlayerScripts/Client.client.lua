local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Cards = require(Shared:WaitForChild("Cards"))

local remotesFolder = ReplicatedStorage:WaitForChild("PirateNationRemotes")
local function R(name)
	return remotesFolder:WaitForChild(name)
end

local GetState = R(Config.Remotes.GetState)
local StartQuest = R(Config.Remotes.StartQuest)
local CollectQuest = R(Config.Remotes.CollectQuest)
local StartGauntlet = R(Config.Remotes.StartGauntlet)
local PlayCard = R(Config.Remotes.PlayCard)
local EndTurn = R(Config.Remotes.EndTurn)
local CraftShip = R(Config.Remotes.CraftShip)
local RecruitPirate = R(Config.Remotes.RecruitPirate)
local CraftItem = remotesFolder:WaitForChild("PN_CraftItem")
local StateChanged = R(Config.Remotes.StateChanged)
local ToastRemote = R(Config.Remotes.Toast)

local state = nil
local selectedTab = "Quests"

local gui = Instance.new("ScreenGui")
gui.Name = "PirateNationUI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

-- theme
local C = {
	bg = Color3.fromRGB(18, 28, 42),
	panel = Color3.fromRGB(28, 42, 62),
	panel2 = Color3.fromRGB(36, 54, 78),
	accent = Color3.fromRGB(230, 170, 60),
	text = Color3.fromRGB(235, 240, 245),
	muted = Color3.fromRGB(150, 165, 185),
	good = Color3.fromRGB(80, 190, 120),
	bad = Color3.fromRGB(220, 90, 90),
	card = Color3.fromRGB(45, 65, 95),
}

local function corner(inst, r)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, r or 8)
	c.Parent = inst
	return c
end

local function pad(inst, n)
	local p = Instance.new("UIPadding")
	p.PaddingTop = UDim.new(0, n)
	p.PaddingBottom = UDim.new(0, n)
	p.PaddingLeft = UDim.new(0, n)
	p.PaddingRight = UDim.new(0, n)
	p.Parent = inst
end

local function mkText(parent, props)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Font = Enum.Font.Gotham
	t.TextColor3 = C.text
	t.TextSize = 14
	t.TextXAlignment = Enum.TextXAlignment.Left
	t.TextYAlignment = Enum.TextYAlignment.Center
	for k, v in pairs(props) do
		t[k] = v
	end
	t.Parent = parent
	return t
end

local function mkBtn(parent, text, props)
	local b = Instance.new("TextButton")
	b.AutoButtonColor = true
	b.Font = Enum.Font.GothamBold
	b.Text = text
	b.TextSize = 14
	b.TextColor3 = C.bg
	b.BackgroundColor3 = C.accent
	b.Size = UDim2.new(0, 120, 0, 34)
	for k, v in pairs(props or {}) do
		b[k] = v
	end
	corner(b, 6)
	b.Parent = parent
	return b
end

-- HUD top bar
local top = Instance.new("Frame")
top.Name = "TopBar"
top.Size = UDim2.new(1, 0, 0, 56)
top.BackgroundColor3 = C.bg
top.BackgroundTransparency = 0.15
top.BorderSizePixel = 0
top.Parent = gui
corner(top, 0)

local title = mkText(top, {
	Text = "Pirate Nation",
	Font = Enum.Font.GothamBold,
	TextSize = 20,
	TextColor3 = C.accent,
	Size = UDim2.new(0, 220, 1, 0),
	Position = UDim2.new(0, 16, 0, 0),
})

local statsLabel = mkText(top, {
	Name = "Stats",
	Text = "Loading...",
	Size = UDim2.new(0.55, 0, 1, 0),
	Position = UDim2.new(0, 240, 0, 0),
	TextSize = 14,
})

-- side nav
local nav = Instance.new("Frame")
nav.Size = UDim2.new(0, 140, 1, -72)
nav.Position = UDim2.new(0, 12, 0, 64)
nav.BackgroundColor3 = C.panel
nav.BorderSizePixel = 0
nav.Parent = gui
corner(nav, 10)
pad(nav, 10)

local navLayout = Instance.new("UIListLayout")
navLayout.Padding = UDim.new(0, 8)
navLayout.Parent = nav

local content = Instance.new("Frame")
content.Name = "Content"
content.Size = UDim2.new(1, -176, 1, -72)
content.Position = UDim2.new(0, 164, 0, 64)
content.BackgroundColor3 = C.panel
content.BorderSizePixel = 0
content.Parent = gui
corner(content, 10)

local contentScroll = Instance.new("ScrollingFrame")
contentScroll.Size = UDim2.new(1, -16, 1, -16)
contentScroll.Position = UDim2.new(0, 8, 0, 8)
contentScroll.BackgroundTransparency = 1
contentScroll.BorderSizePixel = 0
contentScroll.ScrollBarThickness = 6
contentScroll.CanvasSize = UDim2.new(0, 0, 0, 0)
contentScroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
contentScroll.Parent = content

local contentList = Instance.new("UIListLayout")
contentList.Padding = UDim.new(0, 10)
contentList.SortOrder = Enum.SortOrder.LayoutOrder
contentList.Parent = contentScroll
pad(contentScroll, 8)

-- toast
local toast = mkText(gui, {
	Name = "Toast",
	Text = "",
	TextSize = 16,
	Font = Enum.Font.GothamBold,
	TextColor3 = C.accent,
	BackgroundColor3 = C.bg,
	BackgroundTransparency = 0.2,
	TextXAlignment = Enum.TextXAlignment.Center,
	Size = UDim2.new(0, 420, 0, 40),
	Position = UDim2.new(0.5, -210, 0, 70),
	Visible = false,
	ZIndex = 20,
})
corner(toast, 8)

local function showToast(msg)
	toast.Text = msg
	toast.Visible = true
	toast.TextTransparency = 0
	task.delay(2.4, function()
		if toast.Text == msg then
			toast.Visible = false
		end
	end)
end

ToastRemote.OnClientEvent:Connect(showToast)

local function clearContent()
	for _, ch in ipairs(contentScroll:GetChildren()) do
		if ch:IsA("GuiObject") then
			ch:Destroy()
		end
	end
end

local function section(titleText)
	local f = Instance.new("Frame")
	f.BackgroundColor3 = C.panel2
	f.Size = UDim2.new(1, -8, 0, 0)
	f.AutomaticSize = Enum.AutomaticSize.Y
	f.BorderSizePixel = 0
	corner(f, 8)
	pad(f, 12)
	local lay = Instance.new("UIListLayout")
	lay.Padding = UDim.new(0, 8)
	lay.Parent = f
	mkText(f, {
		Text = titleText,
		Font = Enum.Font.GothamBold,
		TextSize = 18,
		TextColor3 = C.accent,
		Size = UDim2.new(1, 0, 0, 24),
	})
	f.Parent = contentScroll
	return f
end

local function refreshStats()
	if not state then
		return
	end
	local inv = state.inventory or {}
	local crew = state.crew and state.crew[1]
	local crewTxt = crew and string.format("%s Lv%d", crew.name, crew.level) or "-"
	statsLabel.Text = string.format(
		"Energy %d/%d   Marks %d   Gold %d   Ship %s   %s",
		state.energy or 0,
		state.energyMax or 0,
		inv.Marks or 0,
		inv.Gold or 0,
		state.shipId or "?",
		crewTxt
	)
end

local function renderQuests()
	clearContent()
	local q = section("Quests — spend Energy, haul loot")
	if state.activeQuest then
		local left = math.max(0, (state.activeQuest.endsAt or 0) - os.time())
		mkText(q, {
			Text = string.format("Active: %s — %ds remaining", state.activeQuest.name or "?", left),
			Size = UDim2.new(1, 0, 0, 22),
			TextColor3 = C.muted,
		})
		local btn = mkBtn(q, left > 0 and "At sea..." or "Collect loot", {
			Size = UDim2.new(0, 160, 0, 36),
		})
		if left > 0 then
			btn.BackgroundColor3 = C.muted
			btn.AutoButtonColor = false
		else
			btn.MouseButton1Click:Connect(function()
				local ok, err = CollectQuest:InvokeServer()
				if not ok then
					showToast(err or "Failed")
				end
			end)
		end
	else
		for _, tier in ipairs(state.questTiers or {}) do
			local row = Instance.new("Frame")
			row.BackgroundTransparency = 1
			row.Size = UDim2.new(1, 0, 0, 48)
			row.Parent = q
			mkText(row, {
				Text = string.format("%s  (%d Energy) — %s", tier.name, tier.energy, tier.desc),
				Size = UDim2.new(1, -140, 1, 0),
				TextWrapped = true,
			})
			local b = mkBtn(row, "Sail", {
				Position = UDim2.new(1, -120, 0.5, -17),
				Size = UDim2.new(0, 110, 0, 34),
			})
			b.MouseButton1Click:Connect(function()
				local ok, err = StartQuest:InvokeServer(tier.id)
				if not ok then
					showToast(err or "Failed")
				end
			end)
		end
	end
end

local function renderCombat()
	clearContent()
	local c = state.combat
	if not c or not c.active then
		local s = section("Gauntlet — card ship battles")
		mkText(s, {
			Text = string.format("Cost: %d Energy. Win Marks, Gold, Iron, crew XP.", (state.gauntlet and state.gauntlet.energyCost) or 5),
			Size = UDim2.new(1, 0, 0, 22),
			TextColor3 = C.muted,
		})
		for _, d in ipairs((state.gauntlet and state.gauntlet.difficulties) or {}) do
			local b = mkBtn(s, d.name, { Size = UDim2.new(0, 120, 0, 36) })
			b.MouseButton1Click:Connect(function()
				local ok, err = StartGauntlet:InvokeServer(d.id)
				if not ok then
					showToast(err or "Failed")
				end
			end)
		end
		return
	end

	local s = section(string.format("Battle vs %s", c.enemyName or "Foe"))
	mkText(s, {
		Text = string.format(
			"You HP %d  Shield %d  AP %d/%s    |    Enemy HP %d  Shield %d    Turn %d",
			c.playerHp,
			c.playerShield,
			c.playerAp,
			"?",
			c.enemyHp,
			c.enemyShield,
			c.turn
		),
		Size = UDim2.new(1, 0, 0, 24),
		Font = Enum.Font.GothamBold,
	})

	if c.over then
		mkText(s, {
			Text = c.won and "VICTORY" or "DEFEAT",
			TextColor3 = c.won and C.good or C.bad,
			Font = Enum.Font.GothamBold,
			TextSize = 22,
			Size = UDim2.new(1, 0, 0, 28),
		})
		local b = mkBtn(s, "Leave battle", { Size = UDim2.new(0, 140, 0, 36) })
		b.MouseButton1Click:Connect(function()
			EndTurn:InvokeServer()
		end)
	else
		local handRow = Instance.new("Frame")
		handRow.BackgroundTransparency = 1
		handRow.Size = UDim2.new(1, 0, 0, 120)
		handRow.Parent = s
		local hl = Instance.new("UIListLayout")
		hl.FillDirection = Enum.FillDirection.Horizontal
		hl.Padding = UDim.new(0, 8)
		hl.Parent = handRow

		for i, cardId in ipairs(c.hand or {}) do
			local card = Cards.Get(cardId)
			local btn = Instance.new("TextButton")
			btn.Size = UDim2.new(0, 110, 0, 110)
			btn.BackgroundColor3 = C.card
			btn.TextColor3 = C.text
			btn.TextWrapped = true
			btn.Font = Enum.Font.Gotham
			btn.TextSize = 12
			btn.AutoButtonColor = true
			if card then
				btn.Text = string.format("%s\n[%s] AP%d\nDMG%d SH%d\nHEAL%d", card.name, card.kind, card.ap, card.damage, card.shield, card.heal)
				if card.ap > (c.playerAp or 0) then
					btn.BackgroundColor3 = Color3.fromRGB(60, 60, 70)
				end
			else
				btn.Text = cardId
			end
			corner(btn, 8)
			btn.Parent = handRow
			local idx = i
			btn.MouseButton1Click:Connect(function()
				local ok, err = PlayCard:InvokeServer(idx)
				if not ok then
					showToast(err or "Can't play")
				end
			end)
		end

		local endBtn = mkBtn(s, "End turn", { Size = UDim2.new(0, 120, 0, 36) })
		endBtn.BackgroundColor3 = C.bad
		endBtn.TextColor3 = Color3.new(1, 1, 1)
		endBtn.MouseButton1Click:Connect(function()
			EndTurn:InvokeServer()
		end)
	end

	local logBox = section("Combat log")
	local lines = {}
	for i = math.max(1, #(c.log or {}) - 8), #(c.log or {}) do
		table.insert(lines, c.log[i])
	end
	mkText(logBox, {
		Text = table.concat(lines, "\n"),
		Size = UDim2.new(1, 0, 0, 120),
		TextYAlignment = Enum.TextYAlignment.Top,
		TextWrapped = true,
		TextColor3 = C.muted,
	})
end

local function renderCraft()
	clearContent()
	local inv = state.inventory or {}
	local bag = section("Cargo")
	local parts = {}
	for k, v in pairs(inv) do
		if typeof(v) == "number" and v > 0 then
			table.insert(parts, k .. ": " .. v)
		end
	end
	table.sort(parts)
	mkText(bag, {
		Text = #parts > 0 and table.concat(parts, "  ·  ") or "Empty hold",
		Size = UDim2.new(1, 0, 0, 40),
		TextWrapped = true,
		TextColor3 = C.muted,
	})

	local ships = section("Shipwright (upgrade in order)")
	mkText(ships, {
		Text = "Current hull: " .. tostring(state.shipId),
		Size = UDim2.new(1, 0, 0, 20),
	})
	for _, ship in ipairs(state.ships or {}) do
		if ship.id ~= "skiff" then
			local costParts = {}
			for k, v in pairs(ship.cost or {}) do
				table.insert(costParts, v .. " " .. k)
			end
			local row = Instance.new("Frame")
			row.BackgroundTransparency = 1
			row.Size = UDim2.new(1, 0, 0, 44)
			row.Parent = ships
			mkText(row, {
				Text = string.format("%s — %s", ship.name, table.concat(costParts, ", ")),
				Size = UDim2.new(1, -130, 1, 0),
			})
			local b = mkBtn(row, "Craft", {
				Position = UDim2.new(1, -120, 0.5, -17),
				Size = UDim2.new(0, 110, 0, 34),
			})
			b.MouseButton1Click:Connect(function()
				local ok, err = CraftShip:InvokeServer(ship.id)
				if not ok then
					showToast(err or "Failed")
				end
			end)
		end
	end

	local items = section("Workshop")
	local recipes = state.recipes and state.recipes.Items or {}
	for _, r in ipairs(recipes) do
		local costParts = {}
		for k, v in pairs(r.cost or {}) do
			table.insert(costParts, v .. " " .. k)
		end
		local row = Instance.new("Frame")
		row.BackgroundTransparency = 1
		row.Size = UDim2.new(1, 0, 0, 44)
		row.Parent = items
		mkText(row, {
			Text = string.format("%s — %s (%s)", r.name, r.desc, table.concat(costParts, ", ")),
			Size = UDim2.new(1, -130, 1, 0),
			TextWrapped = true,
		})
		local b = mkBtn(row, "Craft", {
			Position = UDim2.new(1, -120, 0.5, -17),
			Size = UDim2.new(0, 110, 0, 34),
		})
		b.MouseButton1Click:Connect(function()
			local ok, err = CraftItem:InvokeServer(r.id)
			if not ok then
				showToast(err or "Failed")
			end
		end)
	end
end

local function renderCrew()
	clearContent()
	local s = section("Crew roster")
	for _, p in ipairs(state.crew or {}) do
		mkText(s, {
			Text = string.format("%s — Lv %d  (%d/%d XP)", p.name, p.level, p.xp, p.xpToLevel),
			Size = UDim2.new(1, 0, 0, 24),
		})
	end
	local ship = nil
	for _, sh in ipairs(state.ships or {}) do
		if sh.id == state.shipId then
			ship = sh
		end
	end
	mkText(s, {
		Text = string.format("Berths: %d / %d", #(state.crew or {}), ship and ship.slots or 2),
		Size = UDim2.new(1, 0, 0, 22),
		TextColor3 = C.muted,
	})
	local b = mkBtn(s, "Recruit (75 Marks + 1 Rum)", { Size = UDim2.new(0, 220, 0, 36) })
	b.MouseButton1Click:Connect(function()
		local ok, err = RecruitPirate:InvokeServer()
		if not ok then
			showToast(err or "Failed")
		end
	end)

	local st = section("Captain's ledger")
	local stats = state.stats or {}
	mkText(st, {
		Text = string.format(
			"Quests %d · Gauntlet W/L %d/%d · Damage dealt %d",
			stats.questsDone or 0,
			stats.gauntletsWon or 0,
			stats.gauntletsLost or 0,
			stats.damageDealt or 0
		),
		Size = UDim2.new(1, 0, 0, 24),
	})
end

local function render()
	refreshStats()
	if selectedTab == "Quests" then
		renderQuests()
	elseif selectedTab == "Gauntlet" then
		renderCombat()
	elseif selectedTab == "Craft" then
		renderCraft()
	elseif selectedTab == "Crew" then
		renderCrew()
	end
end

local tabs = { "Quests", "Gauntlet", "Craft", "Crew" }
local tabButtons = {}
for _, name in ipairs(tabs) do
	local b = mkBtn(nav, name, {
		Size = UDim2.new(1, 0, 0, 40),
		BackgroundColor3 = C.panel2,
		TextColor3 = C.text,
	})
	tabButtons[name] = b
	b.MouseButton1Click:Connect(function()
		selectedTab = name
		for n, btn in pairs(tabButtons) do
			btn.BackgroundColor3 = (n == selectedTab) and C.accent or C.panel2
			btn.TextColor3 = (n == selectedTab) and C.bg or C.text
		end
		render()
	end)
end
tabButtons.Quests.BackgroundColor3 = C.accent
tabButtons.Quests.TextColor3 = C.bg

StateChanged.OnClientEvent:Connect(function(newState)
	state = newState
	if state.combat and state.combat.active and selectedTab ~= "Gauntlet" then
		selectedTab = "Gauntlet"
		for n, btn in pairs(tabButtons) do
			btn.BackgroundColor3 = (n == selectedTab) and C.accent or C.panel2
			btn.TextColor3 = (n == selectedTab) and C.bg or C.text
		end
	end
	render()
end)

task.spawn(function()
	local ok, s = pcall(function()
		return GetState:InvokeServer()
	end)
	if ok and s then
		state = s
		render()
	else
		statsLabel.Text = "Waiting for server..."
	end
end)

-- auto refresh active quest timer
task.spawn(function()
	while true do
		task.wait(1)
		if state and state.activeQuest and selectedTab == "Quests" then
			renderQuests()
			refreshStats()
		end
	end
end)

print("[PirateNation] client ready")
