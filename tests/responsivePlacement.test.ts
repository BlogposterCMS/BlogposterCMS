import {
  defaultResponsiveWidthRange,
  normalizeResponsivePlacementContract,
  projectResponsiveHorizontalPosition,
  resolveResponsivePlacementGeometry,
  upsertResponsivePlacementRule
} from '../ui/shared/layout/responsivePlacement';

describe('responsive placement contract', () => {
  const base = {
    centerXPercent: 75,
    yPx: 120,
    widthPx: 420,
    heightPx: 300,
    minWidthPx: 180,
    minHeightPx: 120
  };

  it('uses stable default viewport bands', () => {
    expect(defaultResponsiveWidthRange(390)).toEqual({ minWidth: 320, maxWidth: 600 });
    expect(defaultResponsiveWidthRange(820)).toEqual({ minWidth: 601, maxWidth: 1024 });
    expect(defaultResponsiveWidthRange(1280)).toEqual({ minWidth: 1025, maxWidth: 3840 });
  });

  it('projects fixed pixel geometry inside the viewport without stretching it', () => {
    expect(projectResponsiveHorizontalPosition(base, 1120)).toBe(630);
    expect(projectResponsiveHorizontalPosition({ ...base, centerXPercent: 4 }, 1120)).toBe(0);
    expect(projectResponsiveHorizontalPosition(base, 390)).toBe(-15);
  });

  it('resolves a narrower authored rule only inside its saved range', () => {
    const contract = normalizeResponsivePlacementContract({}, base);
    const mobileGeometry = {
      ...base,
      centerXPercent: 50,
      widthPx: 340,
      heightPx: 360
    };
    const { contract: withMobile, rule } = upsertResponsivePlacementRule(
      contract,
      390,
      { minWidth: 320, maxWidth: 600 },
      mobileGeometry
    );

    expect(rule).toMatchObject({ minWidth: 320, maxWidth: 600 });
    expect(resolveResponsivePlacementGeometry(withMobile, 390)).toMatchObject(mobileGeometry);
    expect(resolveResponsivePlacementGeometry(withMobile, 1120)).toMatchObject(base);
  });
});
