-- Battlepass free track: nerf cash so the whole track totals exactly 5,000,000.
-- Previous total was 42,801,600; every tier keeps its place in the curve (~x0.117),
-- only the amounts shrink. Premium/VIP rewards are not touched at all.
WITH new_values(level, amount) AS (
	VALUES
	(1, 40),
	(2, 60),
	(3, 80),
	(4, 120),
	(5, 160),
	(6, 250),
	(7, 330),
	(8, 450),
	(9, 570),
	(10, 740),
	(11, 1100),
	(12, 1150),
	(13, 1400),
	(14, 1700),
	(15, 2050),
	(16, 2450),
	(17, 2950),
	(18, 3500),
	(19, 4150),
	(20, 4900),
	(21, 4500),
	(22, 5250),
	(23, 6150),
	(24, 7050),
	(25, 8050),
	(26, 9350),
	(27, 10500),
	(28, 12000),
	(29, 14000),
	(30, 16000),
	(31, 17500),
	(32, 20000),
	(33, 22500),
	(34, 25000),
	(35, 28000),
	(36, 31000),
	(37, 34000),
	(38, 37500),
	(39, 41500),
	(40, 45500),
	(41, 36500),
	(42, 40000),
	(43, 44000),
	(44, 48000),
	(45, 52500),
	(46, 57000),
	(47, 62500),
	(48, 68000),
	(49, 73500),
	(50, 79500),
	(51, 86500),
	(52, 93500),
	(53, 100000),
	(54, 110000),
	(55, 120000),
	(56, 130000),
	(57, 140000),
	(58, 150000),
	(59, 160000),
	(60, 175000),
	(61, 185000),
	(62, 200000),
	(63, 215000),
	(64, 230000),
	(65, 250000),
	(66, 270000),
	(67, 290000),
	(68, 310000),
	(69, 330000),
	(70, 470000)
)
UPDATE battlepass_tier t
SET reward_amount = v.amount,
	reward_label = '$' || to_char(v.amount, 'FM999,999,999')
		|| CASE WHEN v.level = 70 THEN ' 🏆' ELSE '' END
FROM new_values v
WHERE t.season_id = (SELECT id FROM battlepass_season WHERE is_active ORDER BY id DESC LIMIT 1)
	AND t.tier = 'free'
	AND t.reward_type = 'cash'
	AND t.level = v.level;

-- Safety net: the free track must add up to exactly 5,000,000.
DO $$
DECLARE total numeric;
BEGIN
	SELECT COALESCE(SUM(reward_amount), 0) INTO total
	FROM battlepass_tier
	WHERE season_id = (SELECT id FROM battlepass_season WHERE is_active ORDER BY id DESC LIMIT 1)
		AND tier = 'free' AND reward_type = 'cash';
	IF total <> 5000000 THEN
		RAISE EXCEPTION 'battlepass free cash total is %, expected 5000000', total;
	END IF;
END $$;
