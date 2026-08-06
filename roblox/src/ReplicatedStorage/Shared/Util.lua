local Util = {}

function Util.DeepCopy(t)
	if type(t) ~= "table" then
		return t
	end
	local n = {}
	for k, v in pairs(t) do
		n[k] = Util.DeepCopy(v)
	end
	return n
end

function Util.Clamp(x, a, b)
	if x < a then
		return a
	end
	if x > b then
		return b
	end
	return x
end

function Util.RandInt(rng, lo, hi)
	return rng:NextInteger(lo, hi)
end

function Util.Shuffle(rng, arr)
	for i = #arr, 2, -1 do
		local j = rng:NextInteger(1, i)
		arr[i], arr[j] = arr[j], arr[i]
	end
	return arr
end

function Util.Now()
	return os.time()
end

function Util.CanPay(inv, cost)
	for k, v in pairs(cost) do
		local have = inv[k] or 0
		if have < v then
			return false, k
		end
	end
	return true
end

function Util.Pay(inv, cost)
	for k, v in pairs(cost) do
		inv[k] = (inv[k] or 0) - v
	end
end

function Util.Grant(inv, gain)
	for k, v in pairs(gain) do
		inv[k] = (inv[k] or 0) + v
	end
end

return Util
