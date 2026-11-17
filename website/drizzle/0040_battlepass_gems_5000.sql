-- Battlepass premium gems: rebalance so the whole track totals exactly 5000.
-- Previous total was 7410; every tier keeps its place in the curve (x0.6748),
-- only the amounts shrink. Cash bonus is gems * 25 in code, so labels are
-- regenerated to match. Free track is untouched.
WITH new_values(level, amount) AS (
	VALUES
	(1, 7),
	(2, 8),
	(3, 9),
	(4, 11),
	(5, 13),
	(6, 14),
	(7, 17),
	(8, 18),
	(9, 20),
	(10, 22),
	(11, 24),
	(12, 25),
	(13, 27),
	(14, 28),
	(15, 30),
	(16, 32),
	(17, 33),
	(18, 35),
	(19, 37),
	(20, 38),
	(21, 40),
	(22, 42),
	(23, 44),
	(24, 46),
	(25, 47),
	(26, 49),
	(27, 51),
	(28, 53),
	(29, 55),
	(30, 56),
	(31, 58),
	(32, 60),
	(33, 62),
	(34, 63),
	(35, 66),
	(36, 67),
	(37, 70),
	(38, 72),
	(39, 74),
	(40, 76),
	(41, 77),
	(42, 80),
	(43, 81),
	(44, 84),
	(45, 86),
	(46, 88),
	(47, 90),
	(48, 92),
	(49, 94),
	(50, 96),
	(51, 99),
	(52, 101),
	(53, 103),
	(54, 106),
	(55, 109),
	(56, 111),
	(57, 113),
	(58, 116),
	(59, 119),
	(60, 121),
	(61, 123),
	(62, 126),
	(63, 130),
	(64, 132),
	(65, 135),
	(66, 138),
	(67, 141),
	(68, 144),
	(69, 147),
	(70, 219)
)
UPDATE battlepass_tier t
SET reward_amount = v.amount,
	reward_label = v.amount || E'\uD83D\uDC8E + $' || to_char(v.amount * 25, 'FM999,999,999')
FROM new_values v
WHERE t.season_id = (SELECT id FROM battlepass_season WHERE is_active ORDER BY id DESC LIMIT 1)
	AND t.tier = 'premium'
	AND t.reward_type = 'gems'
	AND t.level = v.level;

-- Safety net: the track must add up to exactly 5000 gems.
DO $$
DECLARE total numeric;
BEGIN
	SELECT COALESCE(SUM(reward_amount), 0) INTO total
	FROM battlepass_tier
	WHERE season_id = (SELECT id FROM battlepass_season WHERE is_active ORDER BY id DESC LIMIT 1)
		AND tier = 'premium' AND reward_type = 'gems';
	IF total <> 5000 THEN
		RAISE EXCEPTION 'battlepass gem total is %, expected 5000', total;
	END IF;
END $$;
