export interface VTEXProduct {
  productId: string;
  productName: string;
  brand: string;
  brandId: number;
  linkText: string;
  productReference: string;
  categoryId: string;
  productTitle: string;
  metaTagDescription: string;
  releaseDate: string;
  clusterHighlights: Record<string, string>;
  productClusters: Record<string, string>;
  searchableClusters: Record<string, string>;
  categories: string[];
  categoriesIds: string[];
  link: string;
  allSpecifications: string[];
  allSpecificationsGroups: string[];
  description: string;
  items: VTEXItem[];
}

export interface VTEXItem {
  itemId: string;
  name: string;
  nameComplete: string;
  complementName: string;
  ean: string;
  commercialConditionId: string;
  referenceId: Array<{ Key: string; Value: string }>;
  measurementUnit: string;
  unitMultiplier: number;
  modalType: any;
  isKit: boolean;
  images: Array<{
    imageId: string;
    imageLabel: string;
    imageTag: string;
    imageUrl: string;
    imageText: string;
  }>;
  sellers: Array<{
    sellerId: string;
    sellerName: string;
    addToCartLink: string;
    sellerDefault: boolean;
    commertialOffer: {
      DeliverySlaSamplesPerRegion: any;
      Installments: any[];
      DiscountHighLight: any[];
      GiftSkuIds: any[];
      Teasers: any[];
      PromotionTeasers: any[];
      BuyButtonTagName: string;
      BuyButtonLink: string;
      Price: number;
      ListPrice: number;
      PriceWithoutDiscount: number;
      RewardValue: number;
      PriceValidUntil: string;
      AvailableQuantity: number;
      Tax: number;
      DeliverySlaSamples: any[];
      GetInfoErrorMessage: any;
      CacheVersionUsedToCallCheckout: string;
      PaymentOptions: any;
    };
  }>;
}

export interface VTEXPrice {
  itemId: string;
  listPrice: number;
  costPrice: number;
  basePrice: number;
  fixedPrices: Array<{
    tradePolicyId: string;
    value: number;
    listPrice: number;
    minQuantity: number;
    dateRange: {
      from: string;
      to: string;
    };
  }>;
}

export interface VTEXInventory {
  skuId: string;
  balance: Array<{
    warehouseId: string;
    warehouseName: string;
    totalQuantity: number;
    reservedQuantity: number;
    hasUnlimitedQuantity: boolean;
  }>;
}

export interface AuditedProduct {
  productName: string;
  productId: string;
  skuId: string;
  refId: string;
  isActive: boolean;
  stockTotal: number;
  listPrice: number;
  basePrice: number;
  commercialCondition: string;
}
