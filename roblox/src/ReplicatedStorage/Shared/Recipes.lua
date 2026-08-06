local Recipes = {}

-- Ship craft costs mirror Config.Ships; kept here for UI/recipe browser
Recipes.Ships = {
	{
		id = "sloop",
		name = "Sloop",
		desc = "Faster hull, second cannon. First real pirate vessel.",
		cost = { Wood = 12, Cotton = 6, Iron = 4 },
	},
	{
		id = "brig",
		name = "Brig",
		desc = "Sturdier warship for Gauntlet climbs.",
		cost = { Wood = 24, Cotton = 12, Iron = 10, GoldNugget = 2 },
	},
	{
		id = "galleon",
		name = "Galleon",
		desc = "Flagship. Heavy guns, deep cargo.",
		cost = { Wood = 40, Cotton = 20, Iron = 18, GoldNugget = 5, CannonPart = 3 },
	},
}

Recipes.Items = {
	{
		id = "cannon_part",
		name = "Cannon Part",
		desc = "Machined iron for ship guns.",
		gives = { CannonPart = 1 },
		cost = { Iron = 5, Marks = 40 },
	},
	{
		id = "map_kit",
		name = "Map Kit",
		desc = "Bundle of chart scraps.",
		gives = { MapFragment = 3 },
		cost = { Wood = 2, Cotton = 2, Marks = 25 },
	},
	{
		id = "rum_barrel",
		name = "Rum Barrel",
		desc = "Crew morale in a cask. Used to recruit.",
		gives = { Rum = 1 },
		cost = { Cotton = 3, Marks = 30 },
	},
}

Recipes.RecruitCost = { Marks = 75, Rum = 1 }

return Recipes
