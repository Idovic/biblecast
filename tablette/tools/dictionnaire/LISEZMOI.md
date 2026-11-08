# Dictionnaire biblique (lexique BibleCast)

Les articles sont rédigés dans les fichiers `0*.txt`, un article par bloc :

```
@Mot|catégorie|Référence; Référence|autre nom, autre nom
Premier paragraphe.
Deuxième paragraphe.
```

Catégories : `p` personnage, `l` lieu, `u` peuple, `f` mot de la foi, `o` objet / coutume, `t` fête / temps / mesure, `b` livre de la Bible.

Pour reconstruire `public/dictionnaire.json` et vérifier toutes les références dans la Louis Segond :

```
python3 tools/dictionnaire/build.py public/bible-fr.json public/dictionnaire.json
```

Texte rédigé pour BibleCast, libre de droits ; citations d'après la Louis Segond 1910.
