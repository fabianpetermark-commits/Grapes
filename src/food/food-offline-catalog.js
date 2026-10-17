import { normalizeFoodItem } from './food-data.js'

// A small, offline-first pantry catalog. Values are per 100 g edible portion
// and follow the USDA FoodData Central SR Legacy naming/units convention.
// Keep this list focused on ingredients people enter every day; branded items
// remain available through the online providers.
const FOODS = [
  { id: 'usda-egg-whole', name: 'Tojás, egész', aliases: ['tojás', 'tyúktojás', 'egész tojás'], category: 'Tojás és tejtermék', baseUnit: 'g', nutrients: { energyKcal: 143, protein: 12.56, carbohydrate: 0.72, fat: 9.51, fiber: 0, sugar: 0.37, saturatedFat: 3.13, salt: 0.36 }, servings: [{ name: '1 db tojás', unit: 'piece', grams: 50 }],
  },
  { id: 'usda-egg-boiled', name: 'Tojás, főtt', aliases: ['főtt tojás', 'kemény tojás'], category: 'Tojás és tejtermék', baseUnit: 'g', nutrients: { energyKcal: 155, protein: 12.58, carbohydrate: 1.12, fat: 10.61, fiber: 0, sugar: 1.12, saturatedFat: 3.27, salt: 0.39 }, servings: [{ name: '1 db főtt tojás', unit: 'piece', grams: 50 }] },
  { id: 'usda-chicken-breast', name: 'Csirkemell, sült', aliases: ['csirkemell', 'sült csirkemell'], category: 'Hús', baseUnit: 'g', nutrients: { energyKcal: 165, protein: 31.02, carbohydrate: 0, fat: 3.57, fiber: 0, sugar: 0, saturatedFat: 1.01, salt: 0.19 } },
  { id: 'usda-rice-white-cooked', name: 'Rizs, fehér, főtt', aliases: ['főtt rizs', 'fehér rizs', 'rizs'], category: 'Köret és gabona', baseUnit: 'g', nutrients: { energyKcal: 130, protein: 2.69, carbohydrate: 28.17, fat: 0.28, fiber: 0.4, sugar: 0.05, saturatedFat: 0.08, salt: 0.01 } },
  { id: 'usda-potato-boiled', name: 'Burgonya, főtt', aliases: ['krumpli', 'főtt krumpli', 'burgonya'], category: 'Zöldség', baseUnit: 'g', nutrients: { energyKcal: 87, protein: 1.87, carbohydrate: 20.13, fat: 0.1, fiber: 1.8, sugar: 0.91, saturatedFat: 0.03, salt: 0.01 } },
  { id: 'usda-oats', name: 'Zabpehely', aliases: ['zab', 'zabkása alap', 'zabliszt'], category: 'Köret és gabona', baseUnit: 'g', nutrients: { energyKcal: 389, protein: 16.89, carbohydrate: 66.27, fat: 6.9, fiber: 10.6, sugar: 0.99, saturatedFat: 1.22, salt: 0.01 } },
  { id: 'usda-bread-white', name: 'Kenyér, fehér', aliases: ['fehér kenyér', 'kenyér'], category: 'Pékáru', baseUnit: 'g', nutrients: { energyKcal: 266, protein: 7.64, carbohydrate: 49.42, fat: 3.29, fiber: 2.4, sugar: 5.67, saturatedFat: 0.7, salt: 1.23 } },
  { id: 'usda-milk', name: 'Tej, 2% zsírtartalmú', aliases: ['tej', 'tehéntej'], category: 'Tojás és tejtermék', baseUnit: 'ml', nutrients: { energyKcal: 50, protein: 3.3, carbohydrate: 4.8, fat: 2, fiber: 0, sugar: 5.06, saturatedFat: 1.2, salt: 0.1 } },
  { id: 'usda-yogurt-plain', name: 'Joghurt, natúr', aliases: ['natúr joghurt', 'joghurt'], category: 'Tojás és tejtermék', baseUnit: 'g', nutrients: { energyKcal: 61, protein: 3.47, carbohydrate: 4.66, fat: 3.25, fiber: 0, sugar: 4.66, saturatedFat: 2.1, salt: 0.05 } },
  { id: 'usda-cheese-cheddar', name: 'Sajt, félkemény', aliases: ['sajt', 'reszelt sajt'], category: 'Tojás és tejtermék', baseUnit: 'g', nutrients: { energyKcal: 403, protein: 24.9, carbohydrate: 1.28, fat: 33.14, fiber: 0, sugar: 0.48, saturatedFat: 21.09, salt: 1.83 } },
  { id: 'usda-apple', name: 'Alma héjával', aliases: ['alma'], category: 'Gyümölcs', baseUnit: 'g', nutrients: { energyKcal: 52, protein: 0.26, carbohydrate: 13.81, fat: 0.17, fiber: 2.4, sugar: 10.39, saturatedFat: 0.03, salt: 0 }, servings: [{ name: '1 közepes alma', unit: 'piece', grams: 182 }] },
  { id: 'usda-banana', name: 'Banán', aliases: ['banán'], category: 'Gyümölcs', baseUnit: 'g', nutrients: { energyKcal: 89, protein: 1.09, carbohydrate: 22.84, fat: 0.33, fiber: 2.6, sugar: 12.23, saturatedFat: 0.11, salt: 0 }, servings: [{ name: '1 közepes banán', unit: 'piece', grams: 118 }] },
  { id: 'usda-tomato', name: 'Paradicsom, nyers', aliases: ['paradicsom'], category: 'Zöldség', baseUnit: 'g', nutrients: { energyKcal: 18, protein: 0.88, carbohydrate: 3.89, fat: 0.2, fiber: 1.2, sugar: 2.63, saturatedFat: 0.03, salt: 0.01 } },
  { id: 'usda-cucumber', name: 'Uborka, héjával', aliases: ['uborka'], category: 'Zöldség', baseUnit: 'g', nutrients: { energyKcal: 15, protein: 0.65, carbohydrate: 3.63, fat: 0.11, fiber: 0.5, sugar: 1.67, saturatedFat: 0.04, salt: 0.01 } },
  { id: 'usda-carrot', name: 'Sárgarépa, nyers', aliases: ['répa', 'sárgarépa'], category: 'Zöldség', baseUnit: 'g', nutrients: { energyKcal: 41, protein: 0.93, carbohydrate: 9.58, fat: 0.24, fiber: 2.8, sugar: 4.74, saturatedFat: 0.04, salt: 0.09 } },
  { id: 'usda-avocado', name: 'Avokádó', aliases: ['avokádó'], category: 'Gyümölcs', baseUnit: 'g', nutrients: { energyKcal: 160, protein: 2, carbohydrate: 8.53, fat: 14.66, fiber: 6.7, sugar: 0.66, saturatedFat: 2.13, salt: 0.01 } },
  { id: 'usda-lentils-cooked', name: 'Lencse, főtt', aliases: ['főtt lencse', 'lencse'], category: 'Hüvelyes', baseUnit: 'g', nutrients: { energyKcal: 116, protein: 9.02, carbohydrate: 20.13, fat: 0.38, fiber: 7.9, sugar: 1.8, saturatedFat: 0.05, salt: 0.01 } },
  { id: 'usda-beans-cooked', name: 'Bab, főtt', aliases: ['főtt bab', 'bab'], category: 'Hüvelyes', baseUnit: 'g', nutrients: { energyKcal: 127, protein: 8.67, carbohydrate: 22.8, fat: 0.5, fiber: 8.7, sugar: 0.32, saturatedFat: 0.07, salt: 0.01 } },
  { id: 'usda-olive-oil', name: 'Olívaolaj', aliases: ['olaj', 'olíva olaj'], category: 'Zsiradék', baseUnit: 'g', nutrients: { energyKcal: 884, protein: 0, carbohydrate: 0, fat: 100, fiber: 0, sugar: 0, saturatedFat: 13.81, salt: 0 }, servings: [{ name: '1 evőkanál', unit: 'serving', grams: 13.5 }] },
  { id: 'usda-butter', name: 'Vaj', aliases: ['vaj'], category: 'Zsiradék', baseUnit: 'g', nutrients: { energyKcal: 717, protein: 0.85, carbohydrate: 0.06, fat: 81.11, fiber: 0, sugar: 0.06, saturatedFat: 51.37, salt: 1.15 } },
]

const normalizeText = value => String(value || '').toLocaleLowerCase('hu-HU').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export const OFFLINE_BASIC_FOODS = Object.freeze(FOODS.map(item => normalizeFoodItem({ ...item, kind: 'generic', source: { type: 'usda', id: item.id, attribution: 'USDA FoodData Central · SR Legacy' }, verified: true })))

export function searchOfflineBasicFoods(query, limit = 12) {
  const needle = normalizeText(query).trim()
  if (needle.length < 2) return []
  return OFFLINE_BASIC_FOODS
    .map(food => ({ food, score: normalizeText(`${food.name} ${FOODS.find(item => item.id === food.source.id)?.aliases.join(' ') || ''}`).includes(needle) ? 0 : 1 }))
    .filter(item => item.score === 0)
    .sort((a, b) => a.food.name.localeCompare(b.food.name, 'hu'))
    .slice(0, limit)
    .map(item => item.food)
}
