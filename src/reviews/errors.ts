export class SupersededReviewError extends Error {
	constructor() {
		super("Review job was superseded by a newer commit");
		this.name = "SupersededReviewError";
	}
}

export class NoReviewableExtensionChangesError extends Error {
	constructor() {
		super("Pull request has no reviewable extension files");
		this.name = "NoReviewableExtensionChangesError";
	}
}
