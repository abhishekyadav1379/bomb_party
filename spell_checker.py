import random
from spellchecker import SpellChecker


def get_random_2_letter():
    spell = SpellChecker()
    word_list = list(spell.word_frequency.words())
    random_word = random.choice(word_list)
    if len(random_word) < 2:
        return 'on'
    index = random.randint(0, len(random_word) - 2)
    return random_word[index:index + 2]

# two_letter = get_random_2_letter()
# print(f"Random two-letter combination: {two_letter}")


def check_part_in_word(part, word):
    spell = SpellChecker()
    if part in word:
        if word in spell:
            return True
        else:
            return False
    else:
        return False
