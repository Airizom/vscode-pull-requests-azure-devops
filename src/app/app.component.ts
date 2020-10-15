import { Component } from '@angular/core';

/**
 * Used to determine the type of view shown to the user
 *
 * @enum {number}
 */
enum ViewType {

  /**
   * Setup screen where the user enter the info to connect to azure devops server
   */
  Setup,

  /**
   * Screen where the user reviews a specific pull request
   */
  PullRequestReview,

  /**
   * List of pull requests the user has been assigned or that they have requested
   */
  PullRequestList
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  public viewShownToUser: ViewType;

  // Views to check for
  public setupView: ViewType = ViewType.Setup;
  public pullRequestListView: ViewType = ViewType.PullRequestList;
  public pullRequestReview: ViewType = ViewType.PullRequestReview;

  constructor() {
    this.viewShownToUser = this.getInitalView();
  }

  /**
   * Determine the view to show to the user on start of the extension.
   * This should either be the setup screen of list of pull requests.
   *
   * @returns {ViewType}
   * @memberof AppComponent
   */
  public getInitalView(): ViewType {
    return ViewType.Setup;
  }

}
