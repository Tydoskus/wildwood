// Unified campaign damage/reward curves. Forest is retained; map 15 differs only in its health elites.
// Values are relative to no map multiplier; saved revisions opt in explicitly.
export const CAMPAIGN_PROGRESSION_ENEMIES: Readonly<Record<string, Readonly<Record<string, {damage:number;reward:number;hp?:number}>>>> = {
  "tutorial_forest": {
    "regular:damage": {
      "damage": 86,
      "reward": 3
    },
    "regular:health": {
      "damage": 14,
      "reward": 42
    },
    "regular:armor": {
      "damage": 29,
      "reward": 9
    },
    "elite:damage": {
      "damage": 275,
      "reward": 7
    },
    "elite:health": {
      "damage": 143,
      "reward": 90
    },
    "elite:regen": {
      "damage": 56,
      "reward": 2
    }
  },
  "beginner_desert": {
    "regular:damage": {
      "damage": 335.9540426744094,
      "reward": 8.195954567204613
    },
    "regular:health": {
      "damage": 78.47780033921492,
      "reward": 155.6590696022787
    },
    "regular:armor": {
      "damage": 141.93058419899268,
      "reward": 31.50608690622436
    },
    "elite:damage": {
      "damage": 915.362030325422,
      "reward": 21.189978430527468
    },
    "elite:health": {
      "damage": 662.032880274026,
      "reward": 374.5989527385269
    },
    "elite:regen": {
      "damage": 242.11061228411884,
      "reward": 7.760883548446439
    }
  },
  "intermediate_snowlands": {
    "regular:damage": {
      "damage": 1291.1546975534684,
      "reward": 21.997337912065333
    },
    "regular:health": {
      "damage": 416.3362518425348,
      "reward": 549.38618742885
    },
    "regular:armor": {
      "damage": 667.0534006417338,
      "reward": 105.66628991458958
    },
    "elite:damage": {
      "damage": 3046.8641693144664,
      "reward": 62.338719810505104
    },
    "elite:health": {
      "damage": 2854.6093052263814,
      "reward": 1433.8632417895687
    },
    "elite:regen": {
      "damage": 1018.6568781262686,
      "reward": 28.54981633049294
    }
  },
  "advanced_lava_wastes": {
    "regular:damage": {
      "damage": 4881.953918173973,
      "reward": 58.00066949922678
    },
    "regular:health": {
      "damage": 2090.355997746615,
      "reward": 1846.5420771431002
    },
    "regular:armor": {
      "damage": 3010.5915229502184,
      "reward": 339.5224425974478
    },
    "elite:damage": {
      "damage": 10141.759171452606,
      "reward": 178.22972382936814
    },
    "elite:health": {
      "damage": 11464.032020606472,
      "reward": 5047.3802845895725
    },
    "elite:regen": {
      "damage": 4170.905160445755,
      "reward": 99.56494331483732
    }
  },
  "infernal_depths": {
    "regular:damage": {
      "damage": 18160.427163646247,
      "reward": 150.24090237466407
    },
    "regular:health": {
      "damage": 9932.873443198838,
      "reward": 5910.426848490595
    },
    "regular:armor": {
      "damage": 13048.17239449192,
      "reward": 1045.178697429504
    },
    "elite:damage": {
      "damage": 33757.75005909939,
      "reward": 495.21897740535655
    },
    "elite:health": {
      "damage": 42879.69616324116,
      "reward": 16339.600941999552
    },
    "elite:regen": {
      "damage": 16619.61674628645,
      "reward": 329.1702394999868
    }
  },
  "water_reach": {
    "regular:damage": {
      "damage": 66462.3099526211,
      "reward": 382.3276052039024
    },
    "regular:health": {
      "damage": 44669.19949722303,
      "reward": 18015.92855429934
    },
    "regular:armor": {
      "damage": 54306.79304480863,
      "reward": 3082.4968928460753
    },
    "elite:damage": {
      "damage": 112365.68230296495,
      "reward": 1337.2398618103564
    },
    "elite:health": {
      "damage": 149379.01932161202,
      "reward": 48644.527285364034
    },
    "elite:regen": {
      "damage": 64446.59718250409,
      "reward": 1031.6815324740603
    }
  },
  "samurai_garden": {
    "regular:damage": {
      "damage": 239299.50000417916,
      "reward": 955.818486683245
    },
    "regular:health": {
      "damage": 190116.6082448727,
      "reward": 52296.499652477956
    },
    "regular:armor": {
      "damage": 217052.7278934236,
      "reward": 8709.731776423643
    },
    "elite:damage": {
      "damage": 374019.19669724803,
      "reward": 3509.2655990000458
    },
    "elite:health": {
      "damage": 484675.5414855476,
      "reward": 133181.42340319065
    },
    "elite:regen": {
      "damage": 243202.07438624176,
      "reward": 3065.361723203917
    }
  },
  "cloudspire": {
    "regular:damage": {
      "damage": 847666.7317677673,
      "reward": 2347.51022159519
    },
    "regular:health": {
      "damage": 765791.5433840547,
      "reward": 144566.19745571664
    },
    "regular:armor": {
      "damage": 833072.8080740192,
      "reward": 23577.456334149352
    },
    "elite:damage": {
      "damage": 1244956.2591617324,
      "reward": 8949.897349330435
    },
    "elite:health": {
      "damage": 1685626.0952187777,
      "reward": 361545.25472790917,
      "hp": 1.1667915429624953
    },
    "elite:regen": {
      "damage": 893146.8183213541,
      "reward": 8634.332802620062
    }
  },
  "moonfen": {
    "regular:damage": {
      "damage": 2954101.916010526,
      "reward": 5664.112285899574
    },
    "regular:health": {
      "damage": 2919306.5047855484,
      "reward": 380573.9523451676
    },
    "regular:armor": {
      "damage": 3070487.1878418075,
      "reward": 61147.56295902194
    },
    "elite:damage": {
      "damage": 4143947.9601913607,
      "reward": 22182.718062214535
    },
    "elite:health": {
      "damage": 6361671.607251242,
      "reward": 906385.8867805563,
      "hp": 1.5884729290855257
    },
    "elite:regen": {
      "damage": 3192028.2989624892,
      "reward": 23056.151575347285
    }
  },
  "crystal_hollows": {
    "regular:damage": {
      "damage": 10128445.550658299,
      "reward": 13426.057813475289
    },
    "regular:health": {
      "damage": 10532402.420515994,
      "reward": 954090.4071374277
    },
    "regular:armor": {
      "damage": 10867714.973752912,
      "reward": 151932.74757512155
    },
    "elite:damage": {
      "damage": 13793500.4305588,
      "reward": 53432.605849785454
    },
    "elite:health": {
      "damage": 22951918.65770289,
      "reward": 2163922.8328418043,
      "hp": 2.222785346987463
    },
    "elite:regen": {
      "damage": 11101940.804115832,
      "reward": 58365.449361009545
    }
  },
  "clockwork_ruins": {
    "regular:damage": {
      "damage": 34164660.46815597,
      "reward": 31264.930530564885
    },
    "regular:health": {
      "damage": 35962826.17398994,
      "reward": 2277813.508254531
    },
    "regular:armor": {
      "damage": 36938206.90134195,
      "reward": 361670.9824203198
    },
    "elite:damage": {
      "damage": 45912896.5796758,
      "reward": 125081.43071438822
    },
    "elite:health": {
      "damage": 78369191.38588019,
      "reward": 4919812.713195237,
      "hp": 3.1650987644851627
    },
    "elite:regen": {
      "damage": 37576764.12368942,
      "reward": 140067.0006608753
    }
  },
  "duskfall_orchard": {
    "regular:damage": {
      "damage": 113377899.87854648,
      "reward": 71525.14048660497
    },
    "regular:health": {
      "damage": 116214094.82858357,
      "reward": 5178750.22441604
    },
    "regular:armor": {
      "damage": 120564652.61692573,
      "reward": 824832.8997929366
    },
    "elite:damage": {
      "damage": 152825171.7501565,
      "reward": 284560.23816793726
    },
    "elite:health": {
      "damage": 253250525.84285367,
      "reward": 10652058.36833848,
      "hp": 4.586158304618396
    },
    "elite:regen": {
      "damage": 123773635.38125554,
      "reward": 318659.45188929664
    }
  },
  "neon_bastion": {
    "regular:damage": {
      "damage": 370166144.2869632,
      "reward": 160750.4759129742
    },
    "regular:health": {
      "damage": 355420451.616446,
      "reward": 11212693.019303663
    },
    "regular:armor": {
      "damage": 377894706.51849973,
      "reward": 1802222.136071453
    },
    "elite:damage": {
      "damage": 508692216.3565623,
      "reward": 629144.6114153814
    },
    "elite:health": {
      "damage": 774522370.9734637,
      "reward": 21963253.321743667,
      "hp": 6.762119646924081
    },
    "elite:regen": {
      "damage": 396757561.1793043,
      "reward": 687272.1746069915
    }
  },
  "verdant_catacombs": {
    "regular:damage": {
      "damage": 1189000316.604227,
      "reward": 354926.24270166265
    },
    "regular:health": {
      "damage": 1028737675.3478991,
      "reward": 23119214.022888068
    },
    "regular:armor": {
      "damage": 1137439320.5025942,
      "reward": 3772599.4700743244
    },
    "elite:damage": {
      "damage": 1693227418.0904796,
      "reward": 1351828.6203900338
    },
    "elite:health": {
      "damage": 2241796553.3396883,
      "reward": 43125879.99024909,
      "hp": 10.14585599647747
    },
    "elite:regen": {
      "damage": 1237686272.5825305,
      "reward": 1405211.5082752018
    }
  },
  "ion_citadel": {
    "regular:damage": {
      "damage": 3757372332.6690316,
      "reward": 769867.9715095252
    },
    "regular:health": {
      "damage": 2818029249.501774,
      "reward": 45395663.147630624
    },
    "regular:armor": {
      "damage": 3287700791.085403,
      "reward": 7565943.857938438
    },
    "elite:damage": {
      "damage": 5636058499.003548,
      "reward": 2822849.228868259
    },
    "elite:health": {
      "damage": 6140971027.047363,
      "reward": 84679691.92397012,
      "hp": 15.490540483728077
    },
    "elite:regen": {
      "damage": 3757372332.6690316,
      "reward": 2723739.788857837
    }
  }
};
export const CAMPAIGN_PROGRESSION_BOSS_HEALTH: Readonly<Record<string,number>> = {
  "tutorial_forest": 1,
  "beginner_desert": 2.089645460236829,
  "intermediate_snowlands": 0.4012556273359022,
  "advanced_lava_wastes": 0.4346957856163275,
  "infernal_depths": 0.5980718026243553,
  "water_reach": 0.7837654082476191,
  "samurai_garden": 0.9783262889346478,
  "cloudspire": 1.1631781163701442,
  "moonfen": 1.3172663244343457,
  "crystal_hollows": 1.420907553649528,
  "clockwork_ruins": 1.4598993792696446,
  "duskfall_orchard": 1.4287126566469024,
  "neon_bastion": 1.331777665982386,
  "verdant_catacombs": 1.1824517547511657,
  "ion_citadel": 1
};
export const CAMPAIGN_PROGRESSION_BOSS_REWARDS: Readonly<Record<string,number>> = {};
