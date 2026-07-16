// Master Station Order and Names directory for BMRCL Green Line

export const STATION_ORDER_LIST = [
  "BIET", "JIDL", "MNJN", "NGSA", "DSH", "JLHL", "PYID", "PEYA", "YPI", "YPM",
  "SSFY", "MHLI", "RJNR", "KVPR", "SPRU", "SPGD", "KGWA", "CKPE", "KRMT", "NLC",
  "LBGH", "SECE", "JYN", "RVR", "BSNK", "JPN", "PUTH", "APRC", "KLPK", "VJRH",
  "TGTP", "APTS"
];

export const STATION_NAMES = {
  "BIET": "Madavara", 
  "JIDL": "Chikkabidarakallu", 
  "MNJN": "Manjunathanagar", 
  "NGSA": "Nagasandra",
  "DSH": "Dasarahalli", 
  "JLHL": "Jalahalli", 
  "PYID": "Peenya Industry", 
  "PEYA": "Peenya",
  "YPI": "Goraguntepalya", 
  "YPM": "Yeshwanthpur", 
  "SSFY": "Sandal Soap Factory", 
  "MHLI": "Mahalakshmi",
  "RJNR": "Rajajinagar", 
  "KVPR": "Mahakavi Kuvempu Road", 
  "SPRU": "Srirampura", 
  "SPGD": "Mantri Square Sampige Road",
  "KGWA": "Nadaprabhu Kempegowda", 
  "CKPE": "Chickpete", 
  "KRMT": "Krishna Rajendra Market", 
  "NLC": "National College",
  "LBGH": "Lalbagh", 
  "SECE": "South End Circle", 
  "JYN": "Jayanagar", 
  "RVR": "Rashtreeya Vidyalaya Road",
  "BSNK": "Banashankari", 
  "JPN": "Jaya Prakash Nagar", 
  "PUTH": "Yelachenahalli", 
  "APRC": "Konanakunte Cross",
  "KLPK": "Doddakallasandra", 
  "VJRH": "Vajarahalli", 
  "TGTP": "Thalaghattapura", 
  "APTS": "Silk Institute"
};

// Returns station display name
export const getStationName = (code) => {
  return STATION_NAMES[code] || code || '--';
};
