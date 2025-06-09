import time
from spellchecker import SpellChecker

# Start time measurement
start_time = time.time()

spell = SpellChecker()

word = "training"

# Check if the word is in dictionary (correct)
if word in spell:
    print(f"'{word}' is spelled correctly.")
else:
    print(f"'{word}' is NOT spelled correctly. Did you mean: {spell.correction(word)}?")

# End time measurement
end_time = time.time()

# Calculate and print the time taken
execution_time = end_time - start_time
print(f"Time taken to run the code: {execution_time} seconds.")
