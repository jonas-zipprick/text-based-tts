export const getProficiencyBonus = (challenge: number): number => {
    if (challenge < 5) return 2;
    if (challenge < 9) return 3;
    if (challenge < 13) return 4;
    if (challenge < 17) return 5;
    if (challenge < 21) return 6;
    if (challenge < 25) return 7;
    if (challenge < 29) return 8;
    return 9;
};

export const getAttrModifier = (value: number): number => {
    return Math.floor((value - 10) / 2);
};
