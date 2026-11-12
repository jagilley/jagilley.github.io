"""Hand-composed pen-stroke spec for the bowling ball (photo pixel coords, full res, upright).

Each stroke is routed along the ink between consecutive waypoints (min-cost path on the
ink-darkness map), so waypoints only need to be roughly on the ink; they disambiguate
junctions, crossings and hairpin turns.  A waypoint given as (x, y, "bridge") is joined to
the previous one with a straight segment (used to close a genuine pen gap).

Drawing order = list order.  Directions follow the pen evidence in the photo: blunt
pen-down blobs at starts, tapered flicks at ends; every closed shape was drawn clockwise.
"""

STROKES = [
    # ---- outline: one clockwise pen stroke starting top-centre at (2905,710); when it comes
    # back round it overshoots inside the ball and flicks off at (3205,972).  Split into the
    # closed loop and the overshoot tail.
    dict(id="outline-loop", role="outline", group="outline", closed=True, wps=[
        (2903, 714, "nosnap"), (2950, 721, "bridge"), (3000, 740), (3100, 787), (3200, 838), (3300, 905), (3400, 985),
        (3500, 1095), (3565, 1200), (3605, 1300), (3633, 1400), (3646, 1500), (3646, 1600),
        (3635, 1700), (3612, 1800), (3590, 1900), (3548, 2000), (3450, 2100), (3350, 2172),
        (3250, 2238), (3150, 2282), (3050, 2310), (2950, 2332), (2800, 2355), (2700, 2356),
        (2600, 2330), (2450, 2283), (2300, 2240), (2200, 2200), (2100, 2142), (2000, 2040),
        (1950, 1970), (1900, 1900), (1850, 1800), (1825, 1700), (1810, 1600), (1805, 1500),
        (1810, 1340), (1850, 1200), (1900, 1100), (1950, 1020), (2050, 900), (2150, 800),
        (2250, 740), (2350, 705), (2450, 685), (2600, 675), (2750, 690), (2880, 707),
    ]),
    dict(id="outline-tail", role="outline-overshoot", group="outline", closed=False, wps=[
        (2880, 707), (2950, 735), (3000, 770), (3100, 838), (3150, 885), (3203, 972), (3207, 985, "nosnap"),
    ]),

    # ---- finger holes (clockwise, each started at the top) ----
    # middle-finger hole (upper left of the pair).  Started at the top-right blob; the pen
    # came back over the top-left and curled down inside to (3015,935) -- that end curl is
    # dropped so the loop closes cleanly.
    dict(id="hole-middle", role="hole-middle", group="holes", closed=True, wps=[
        (3025, 890), (3050, 915), (3060, 965), (3058, 1020), (3035, 1065),
        (3007, 1093), (2975, 1060), (2958, 1010), (2963, 950), (2980, 905), (3000, 896),
    ]),
    # ring-finger hole (right of the pair); its lower-right side is crossed by swirl-2.
    dict(id="hole-ring", role="hole-ring", group="holes", closed=True, wps=[
        (3240, 1008), (3268, 1030), (3285, 1080), (3286, 1130), (3279, 1177), (3270, 1203),
        (3257, 1224, "bridge"), (3239, 1241, "bridge"), (3214, 1249, "bridge"),
        (3196, 1236, "bridge"), (3188, 1215), (3185, 1150), (3193, 1080), (3212, 1030),
    ]),
    # thumb hole (larger, lower).  In the drawing the loop does not quite close: the pen
    # stopped in a blob at (3100,1487) ~40 px short of the start.  Closed here.
    dict(id="hole-thumb", role="hole-thumb", group="holes", closed=True, wps=[
        (3085, 1450), (3135, 1436), (3185, 1446), (3230, 1500), (3250, 1565), (3245, 1625),
        (3220, 1670), (3170, 1710), (3095, 1740), (3055, 1700), (3047, 1625), (3058, 1550),
        (3075, 1505),
        (3085, 1450, "bridge"),
    ]),

    # ---- swirls, top to bottom, each drawn left -> right as a zig-zag ----
    # swirl-1: drawn with a light / skipping pen pass, starts on the outline.
    dict(id="swirl-1", role="swirl-1", group="swirls", closed=False, wps=[
        (1826, 1310, "nosnap"), (1900, 1215), (2000, 1135), (2116, 1030), (2178, 1007),
        (2188, 1028), (2180, 1067), (2167, 1093), (2140, 1150, "bridge"), (2120, 1183), (2103, 1207), (2089, 1228), (2104, 1256), (2130, 1265),
        (2192, 1236), (2300, 1125), (2400, 1043), (2480, 975),
        (2462, 1015), (2445, 1060), (2440, 1082), (2462, 1122),
        (2550, 1075), (2885, 797),
        (2866, 832, "bridge"), (2855, 850), (2840, 872),
        (2826, 898, "bridge"), (2818, 924, "bridge"),
    ]),
    # swirl-2: dark start, lighter middle; passes under the middle hole and crosses the
    # bottom of the ring hole.  A thin duplicate retrace beside its first leg
    # (1925,1660)->(2025,1555) is dropped.
    dict(id="swirl-2", role="swirl-2", group="swirls", closed=False, wps=[
        (1905, 1683), (2000, 1580), (2100, 1460), (2200, 1360), (2320, 1290),
        (2300, 1380), (2270, 1480), (2245, 1568),
        (2300, 1550), (2400, 1480), (2662, 1272),
        (2680, 1340), (2700, 1372),
        (2800, 1320), (2900, 1260), (3040, 1203),
        (2970, 1320), (2990, 1355),
        (3100, 1295), (3163, 1257), (3194, 1241),
        (3214, 1231, "bridge"), (3239, 1220, "bridge"), (3257, 1209, "bridge"),
        (3274, 1194, "bridge"), (3290, 1186, "bridge"), (3365, 1161), (3380, 1159, "nosnap"),
    ]),
    # swirl-3: the bold bottom wave.  A tiny pen-start tick at (2135,1830) dropped.
    dict(id="swirl-3", role="swirl-3", group="swirls", closed=False, wps=[
        (2163, 1810), (2130, 1880), (2110, 1940), (2120, 1993),
        (2200, 1960), (2300, 1900), (2400, 1840), (2530, 1790),
        (2500, 1900), (2510, 2008),
        (2600, 2000), (2700, 1960), (2800, 1895), (2900, 1845), (2970, 1840),
        (2965, 1950), (3010, 1962),
        (3100, 1930), (3200, 1880), (3300, 1810), (3400, 1750), (3500, 1695), (3590, 1670),
        (3580, 1735), (3570, 1795),
    ]),
]
