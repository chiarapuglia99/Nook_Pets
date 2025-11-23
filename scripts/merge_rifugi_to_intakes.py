import pandas as pd
import numpy as np

# Percorsi dei file (corretti per esecuzione dalla root del progetto)
intakes_path = 'dataset/animal-shelter-intakes-and-outcomes.csv'
rifugi_path = 'dataset/rifugi_locations.csv'
output_path = 'dataset/animali-rifugi.csv'

# Carica i dati
intakes = pd.read_csv(intakes_path)
rifugi = pd.read_csv(rifugi_path)

n_intakes = len(intakes)
n_rifugi = len(rifugi)

# Crea una lista di indici di rifugi distribuiti uniformemente
rifugi_indices = np.tile(np.arange(n_rifugi), n_intakes // n_rifugi)
rest = n_intakes % n_rifugi
if rest:
    rifugi_indices = np.concatenate([rifugi_indices, np.random.choice(n_rifugi, rest, replace=False)])

np.random.shuffle(rifugi_indices)

# Assegna i rifugi alle righe del dataset principale
rifugi_expanded = rifugi.iloc[rifugi_indices].reset_index(drop=True)

# Unisci i dati
merged = pd.concat([intakes.reset_index(drop=True), rifugi_expanded], axis=1)

# Salva il risultato
merged.to_csv(output_path, index=False)

print(f"File salvato in {output_path}")

