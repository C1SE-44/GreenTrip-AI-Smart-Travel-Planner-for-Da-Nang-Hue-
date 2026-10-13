const fs = require('fs');
let code = fs.readFileSync('src/pages/ExplorePage.tsx', 'utf8');

// Replace the messed up useEffect return
code = code.replace(
  /const t = setTimeout\(\(\) => setLoading\(false\), 800\);\n    return \(/,
  'const t = setTimeout(() => setLoading(false), 800);\n    return () => clearTimeout(t);\n  }, []);\n\n  const filteredPois = useMemo(() => {\n    return allPois.filter((poi) => {\n      const matchCity = cityFilter === \'all\' || poi.city === cityFilter;\n      const matchCat = categoryFilter === \'all\' || poi.category === categoryFilter;\n      const matchSearch = poi.name.toLowerCase().includes(search.toLowerCase());\n      return matchCity && matchCat && matchSearch;\n    });\n  }, [search, cityFilter, categoryFilter]);\n\n  const handleSelectPoi = (id: string) => {\n    setSelectedPoiId((prev) => (prev === id ? null : id));\n  };\n\n  const toggleFavorite = (id: string) => {\n    setFavorites((prev) => {\n      const next = new Set(prev);\n      if (next.has(id)) next.delete(id);\n      else next.add(id);\n      return next;\n    });\n  };\n\n  return ('
);

fs.writeFileSync('src/pages/ExplorePage.tsx', code, 'utf8');
